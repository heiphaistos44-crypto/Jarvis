from __future__ import annotations
import asyncio
import json
import re
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from utils.logger import get_logger
from utils.config import MODELS_DIR
from core.llm import parse_tool_call, _TOOL_CALL_RE
from core.memory import ContextMemory
from core.prompt import build_system_prompt
from core.providers import ProviderManager
from core.stt import STTManager
from core.tts import TTSManager
from tools.registry import ToolRegistry

from utils.rate_limiter import RateLimiter

_rate_limiter = RateLimiter()

logger = get_logger("websocket")

CHUNK_THRESHOLD = 32  # ~2.7s d'audio à 48kHz avant transcription en streaming
MAX_PAYLOAD_BYTES = 2 * 1024 * 1024   # 2 MB — audio chunk upper bound
MAX_TEXT_CHARS = 2000
ALLOWED_ORIGINS = {
    "http://localhost:1420",    # dev Vite
    "http://127.0.0.1:1420",    # dev Vite alt
    "tauri://localhost",         # Tauri v1 production
    "http://tauri.localhost",    # Tauri v2 production (WebView2)
    "https://tauri.localhost",   # Tauri v2 HTTPS variant
}

_SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?…»!?"])\s+|(?<=\.\.\.)\s+')

MAX_AGENT_ITERATIONS = 5


async def _agent_loop(
    ws: "WebSocket",
    providers: "ProviderManager",
    tts: "TTSManager",
    tools: "ToolRegistry",
    messages: list[dict],
    tts_enabled: bool,
    message_id: str,
    tts_queue: "asyncio.Queue[str]",
    system: str,
    preexecuted: tuple[str, dict, str] | None = None,
) -> str:
    """Boucle agent : LLM → tool → LLM → ... → réponse finale (max 5 itérations)."""
    accumulated = ""
    max_tokens = 512 if providers.tier == "local" else 1024
    used_tools = False
    lesson_recorded = False
    user_query = next(
        (m["content"][:200] for m in reversed(messages) if m["role"] == "user"), ""
    )

    async def _notify_fallback(label: str) -> None:
        await manager.send(ws, "notice", {
            "message": f"{label} indisponible — bascule sur le cerveau local.",
        })

    # Fast-path : outil déjà exécuté par le routeur d'intention — le LLM ne
    # fait que formuler la réponse à partir du résultat.
    if preexecuted is not None:
        name, args, result = preexecuted
        used_tools = True
        await manager.send(ws, "agent_step", {
            "phase": "tool", "detail": name, "messageId": message_id,
        })
        await manager.send(ws, "tool_result", {"tool": name, "result": str(result)[:300]})
        messages = messages + [
            {
                "role": "user",
                "content": (
                    f"[RÉSULTAT OUTIL {name}({args})]\n{result}\n\n"
                    "Réponds directement à Monsieur en français, en une ou deux "
                    "phrases, à partir de ce résultat. N'émets PAS de balise "
                    "JARVIS_TOOL — le résultat est déjà là."
                ),
            },
        ]

    tag_open = "<JARVIS_TOOL>"

    for _iteration in range(MAX_AGENT_ITERATIONS):
        full_response = ""
        sentence_buf = ""
        pending = ""  # tokens retenus tant qu'ils peuvent être un début de balise

        await manager.send(ws, "agent_step", {
            "phase": "thinking",
            "detail": f"Itération {_iteration + 1}",
            "messageId": message_id,
        })

        async def _emit(text: str) -> None:
            nonlocal accumulated, sentence_buf
            if not text:
                return
            await manager.send(ws, "token", {"token": text, "messageId": message_id})
            accumulated += text
            if tts_enabled:
                sentence_buf += text
                m = _SENTENCE_BOUNDARY.search(sentence_buf)
                if m and len(sentence_buf.strip()) > 15:
                    phrase = sentence_buf[: m.start() + 1].strip()
                    sentence_buf = sentence_buf[m.end():]
                    if phrase:
                        await tts_queue.put(phrase)

        in_tool_tag = False
        async for token in providers.stream(
            system, messages, max_tokens=max_tokens, on_fallback=_notify_fallback,
        ):
            full_response += token
            if in_tool_tag:
                if "</JARVIS_TOOL>" in full_response:
                    break  # Balise complète → exécuter l'outil
                continue

            pending += token
            idx = pending.find(tag_open)
            if idx != -1:
                # Balise détectée : émettre le texte avant, retenir le reste
                await _emit(pending[:idx])
                pending = ""
                in_tool_tag = True
                if "</JARVIS_TOOL>" in full_response:
                    break
                continue

            # Retenir le plus long suffixe de pending qui est un préfixe de la
            # balise (ex. "<JARVIS_TO") — le reste peut partir au client
            hold = 0
            max_hold = min(len(pending), len(tag_open) - 1)
            for size in range(max_hold, 0, -1):
                if tag_open.startswith(pending[-size:]):
                    hold = size
                    break
            if len(pending) > hold:
                await _emit(pending[: len(pending) - hold])
                pending = pending[len(pending) - hold:] if hold else ""

        # Fin de stream sans balise → flush du buffer retenu
        if not in_tool_tag and pending:
            await _emit(pending)
            pending = ""

        # Vérifier si tool call présent dans la réponse complète
        tool_result = parse_tool_call(full_response)
        if tool_result:
            name, args = tool_result
            logger.info(f"Agent loop iteration {_iteration + 1}: tool call {name}({args})")
            # Notifier le client (outil en cours)
            await manager.send(ws, "agent_step", {
                "phase": "tool", "detail": name, "messageId": message_id,
            })
            await manager.send(ws, "tool_result", {"tool": name, "result": f"⚙️ Exécution de {name}..."})
            # Exécuter l'outil dans un thread (opération bloquante possible)
            try:
                result = await asyncio.to_thread(tools.execute, name, **args)
            except Exception as e:
                result = f"Erreur outil {name}: {e}"
                logger.error(f"Tool execution error: {e}", exc_info=True)

            # Envoyer le résultat au client
            await manager.send(ws, "tool_result", {"tool": name, "result": str(result)[:300]})
            used_tools = True

            # Leçon apprise : un échec d'outil est mémorisé pour ne pas être répété
            if not lesson_recorded and str(result).lower().startswith("erreur"):
                lesson_recorded = True
                try:
                    from core.persistent_memory import get_memory
                    get_memory().record_lesson(
                        context=user_query,
                        lesson=f"L'outil {name}({args}) a échoué : {str(result)[:120]}",
                    )
                except Exception:
                    logger.warning("Impossible d'enregistrer la leçon", exc_info=True)

            # Extraire le texte visible avant la balise tool (s'il y en a)
            visible = _TOOL_CALL_RE.sub("", full_response).strip()
            if visible and visible not in accumulated:
                await manager.send(ws, "token", {"token": visible, "messageId": message_id})
                accumulated += visible

            # Réinjecter dans le contexte pour la prochaine itération LLM
            messages = messages + [
                {"role": "assistant", "content": full_response},
                {
                    "role": "user",
                    "content": (
                        f"[RÉSULTAT OUTIL {name}]\n{result}\n\n"
                        "Tu disposes maintenant du résultat ci-dessus. Réponds directement "
                        "à Monsieur en français, en une ou deux phrases. N'émets PAS de "
                        "nouvelle balise JARVIS_TOOL pour cette question — le résultat "
                        "est déjà là."
                    ),
                },
            ]
            continue  # Prochaine itération

        else:
            # Pas de tool → réponse finale
            # Envoyer ce qui n'a pas encore été streamé
            remaining = _TOOL_CALL_RE.sub("", full_response).strip()
            if remaining and remaining not in accumulated:
                await manager.send(ws, "token", {"token": remaining, "messageId": message_id})
                accumulated += remaining

            # Flush le dernier buffer TTS
            if tts_enabled and sentence_buf.strip():
                await tts_queue.put(sentence_buf.strip())

            break  # Réponse finale → sortir de la boucle

    # ── Passe de vérification (cloud + outils utilisés uniquement) ──────────
    if used_tools and providers.tier == "cloud" and accumulated.strip():
        correction = await _verify_pass(ws, providers, system, messages, accumulated, message_id)
        if correction:
            await manager.send(ws, "token", {"token": f"\n{correction}", "messageId": message_id})
            accumulated += f"\n{correction}"
            if tts_enabled:
                await tts_queue.put(correction)

    return accumulated


async def _verify_pass(
    ws: "WebSocket",
    providers: "ProviderManager",
    system: str,
    messages: list[dict],
    response: str,
    message_id: str,
) -> str:
    """Relecture courte de la réponse (discipline verification). Retourne la
    correction à annoncer, ou '' si la réponse est validée."""
    await manager.send(ws, "agent_step", {
        "phase": "verify", "detail": "Relecture de la réponse", "messageId": message_id,
    })
    verify_messages = messages + [
        {"role": "assistant", "content": response},
        {
            "role": "user",
            "content": (
                "Vérifie ta réponse ci-dessus : répond-elle exactement à la demande "
                "initiale, sans erreur factuelle par rapport aux résultats d'outils ? "
                "Si oui, réponds exactement OK. Sinon, donne uniquement la correction "
                "en une ou deux phrases."
            ),
        },
    ]
    try:
        chunks = [
            token
            async for token in providers.stream(system, verify_messages, max_tokens=200)
        ]
    except Exception as e:
        logger.warning(f"Passe de vérification échouée: {e}")
        return ""
    verdict = "".join(chunks).strip()
    if not verdict or verdict.upper().startswith("OK"):
        return ""
    logger.info(f"Vérification: correction émise ({verdict[:80]})")
    return verdict


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)
        logger.info("Client WebSocket connecté")

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)
        logger.info("Client WebSocket déconnecté")

    async def send(self, ws: WebSocket, event_type: str, payload: dict) -> None:
        await ws.send_text(json.dumps({"type": event_type, "payload": payload}))


manager = ConnectionManager()


async def _tts_sentence_worker(
    queue: asyncio.Queue[str | None],
    ws: WebSocket,
    tts: TTSManager,
) -> None:
    """Consomme les phrases de la queue, synthétise et envoie les chunks audio.

    Garantit l'envoi du chunk final même si une synthèse échoue.
    """
    index = 0
    try:
        while True:
            sentence: str | None = await queue.get()
            if sentence is None:
                break
            try:
                audio_b64 = await tts.synthesize(sentence)
                if audio_b64:
                    await manager.send(ws, "tts_chunk", {"audio": audio_b64, "final": False, "index": index})
                    index += 1
            except Exception as e:
                logger.warning(f"TTS synthesis failed for sentence: {e}")
    finally:
        try:
            await manager.send(ws, "tts_chunk", {"audio": "", "final": True, "index": index})
        except Exception:
            pass  # WebSocket déjà fermé — normal à la déconnexion


# Cache par connexion du system prompt local (stable → cache KV llama-cpp
# préservé). Clé : id(memory) — une ContextMemory par connexion.
_system_cache: dict[int, str] = {}


async def handle_text_query(
    ws: WebSocket,
    text: str,
    providers: ProviderManager,
    memory: ContextMemory,
    tts: TTSManager,
    tools: ToolRegistry,
    tts_enabled: bool = True,
) -> None:
    await manager.send(ws, "status", {"status": "processing"})
    memory.add_user(text)
    message_id = str(uuid.uuid4())

    if providers.tier == "local":
        # Prompt STABLE sur toute la connexion : indispensable au cache KV.
        key = id(memory)
        if key not in _system_cache:
            _system_cache[key] = build_system_prompt("local", text, stable=True)
        system = _system_cache[key]
    else:
        system = build_system_prompt(providers.tier, text)

    # Routeur d'intention : les demandes évidentes exécutent l'outil
    # immédiatement, sans dépendre du LLM pour le déclencher.
    preexecuted: tuple[str, dict, str] | None = None
    from core.intent import fast_route
    route = fast_route(text)
    if route is not None:
        name, args = route
        logger.info(f"Fast-path intent: {name}({args})")
        try:
            result = await asyncio.to_thread(tools.execute, name, **args)
            preexecuted = (name, args, str(result))
        except Exception as e:
            logger.warning(f"Fast-path {name} en échec ({e}) — retour boucle agent")

    # ── Agent loop (multi-tool, max MAX_AGENT_ITERATIONS) ──────────────────
    tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
    tts_task = None
    if tts_enabled and tts.is_available:
        tts_task = asyncio.create_task(_tts_sentence_worker(tts_queue, ws, tts))

    try:
        final_text = await _agent_loop(
            ws=ws,
            providers=providers,
            tts=tts,
            tools=tools,
            messages=memory.get_messages(),
            tts_enabled=tts_enabled and tts.is_available,
            message_id=message_id,
            tts_queue=tts_queue,
            system=system,
            preexecuted=preexecuted,
        )
    finally:
        if tts_task:
            await tts_queue.put(None)
            await tts_task

    if final_text:
        memory.add_assistant(final_text)

    await manager.send(ws, "agent_step", {"phase": "done", "detail": "", "messageId": message_id})
    await manager.send(ws, "message_done", {"messageId": message_id})
    await manager.send(ws, "status", {"status": "idle"})


async def transcribe_and_query(
    ws: WebSocket,
    audio_buffer: list[list[float]],
    sample_rate: int,
    stt: STTManager,
    providers: ProviderManager,
    memory: ContextMemory,
    tts: TTSManager,
    tools: ToolRegistry,
    tts_enabled: bool = True,
) -> None:
    if not audio_buffer:
        return
    text = await stt.transcribe_chunks(audio_buffer, sample_rate)
    logger.info(f"STT transcription: '{text}'")
    if text.strip():
        await manager.send(ws, "stt_text", {"text": text.strip()})
        await handle_text_query(ws, text.strip(), providers, memory, tts, tools, tts_enabled)


async def websocket_handler(
    ws: WebSocket,
    providers: ProviderManager,
    stt: STTManager,
    tts: TTSManager,
    tools: ToolRegistry,
    max_context_messages: int = 20,
) -> None:
    # Origin check — reject connections from unexpected origins
    origin = ws.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        logger.warning(f"Origine WebSocket refusée: {origin!r}")
        await ws.close(code=4403, reason="Origin not allowed")
        return

    await manager.connect(ws)
    ws_id = id(ws)

    from core.monitor import subscribe as _monitor_subscribe, unsubscribe as _monitor_unsubscribe
    alert_queue = _monitor_subscribe()

    async def _forward_alerts():
        while True:
            try:
                alert = await asyncio.wait_for(alert_queue.get(), timeout=1.0)
                await manager.send(ws, alert["type"], alert["payload"])
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

    alert_task = asyncio.create_task(_forward_alerts())

    # Notify client of server capabilities immediately on connect
    await manager.send(ws, "server_status", {
        "llm": providers.is_available,
        "stt": stt.is_available,
        "tts": tts.is_available,
        "provider": providers.active.name,
        "providerLabel": providers.active.label,
        "providerModel": providers.active.model,
    })

    # Per-connection memory — no shared state between clients
    memory = ContextMemory(max_context_messages)

    audio_buffer: list[list[float]] = []
    current_sample_rate: int = 16000
    tts_enabled: bool = True
    wake_detector = None  # lazy — instancié au 1er wake_audio (modèle stateful par connexion)

    try:
        while True:
            raw = await ws.receive_text()

            if len(raw) > MAX_PAYLOAD_BYTES:
                logger.warning(f"Payload trop grand: {len(raw)} bytes")
                continue

            event = json.loads(raw)
            event_type: str = event.get("type", "")
            payload: dict = event.get("payload", {})

            if event_type == "text_query":
                if not _rate_limiter.allow_text(ws_id):
                    await manager.send(ws, "error", {"message": "Trop de requêtes. Patientez une minute."})
                    continue
                text = str(payload.get("text", "")).strip()
                if not text:
                    continue
                text = text[:MAX_TEXT_CHARS]
                await handle_text_query(ws, text, providers, memory, tts, tools, tts_enabled)

            elif event_type == "audio_chunk":
                if not _rate_limiter.allow_audio(ws_id):
                    continue
                if stt.is_available:
                    chunk_data = payload.get("data")
                    if not isinstance(chunk_data, list):
                        continue
                    audio_buffer.append(chunk_data)
                    current_sample_rate = int(payload.get("sampleRate", 16000))
                    if len(audio_buffer) == 1:
                        await manager.send(ws, "status", {"status": "listening"})
                    if len(audio_buffer) >= CHUNK_THRESHOLD:
                        chunks = list(audio_buffer)
                        audio_buffer.clear()
                        await transcribe_and_query(
                            ws, chunks, current_sample_rate, stt, providers, memory, tts, tools, tts_enabled
                        )
                        if stt.is_available:
                            await manager.send(ws, "status", {"status": "listening"})

            elif event_type == "wake_audio":
                # Mode veille : frames analysées pour « Hey Jarvis » uniquement,
                # jamais bufferisées pour le STT.
                if not _rate_limiter.allow_audio(ws_id):
                    continue
                chunk_data = payload.get("data")
                if not isinstance(chunk_data, list):
                    continue
                if wake_detector is None:
                    from core.wakeword import WakeWordDetector
                    wake_detector = WakeWordDetector()
                    if not wake_detector.is_available:
                        await manager.send(ws, "wake_unavailable", {})
                        continue
                sr = int(payload.get("sampleRate", 16000))
                if await wake_detector.feed(chunk_data, sr):
                    await manager.send(ws, "wake", {})

            elif event_type == "wake_reset":
                if wake_detector is not None:
                    wake_detector.reset()

            elif event_type == "mic_stop":
                if audio_buffer and stt.is_available:
                    chunks = list(audio_buffer)
                    audio_buffer.clear()
                    await transcribe_and_query(
                        ws, chunks, current_sample_rate, stt, providers, memory, tts, tools, tts_enabled
                    )
                else:
                    audio_buffer.clear()
                    await manager.send(ws, "status", {"status": "idle"})

            elif event_type == "tts_done":
                await manager.send(ws, "status", {"status": "idle"})

            elif event_type == "set_tts":
                tts_enabled = bool(payload.get("enabled", True))
                logger.info(f"TTS {'activé' if tts_enabled else 'désactivé'}")

            elif event_type == "set_voice":
                voice_id = str(payload.get("voice", "")).strip()
                if voice_id.startswith("edge:"):
                    # Voix neurale Edge-TTS — validation stricte du nom
                    edge_name = voice_id[5:]
                    if re.fullmatch(r"[a-zA-Z]{2}-[a-zA-Z]{2}-[a-zA-Z0-9]+", edge_name):
                        tts.set_edge_voice(edge_name)
                    else:
                        logger.warning(f"Nom de voix Edge invalide: {edge_name!r}")
                elif voice_id:
                    voice_path = MODELS_DIR / "piper" / f"{voice_id}.onnx"
                    if voice_path.exists():
                        tts.set_voice(voice_path)
                    else:
                        logger.warning(f"Voix introuvable: {voice_path}")

            elif event_type == "clear_history":
                memory.clear()
                logger.info("Historique effacé")

            else:
                logger.warning(f"Type d'événement inconnu: {event_type}")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Erreur WebSocket: {e}", exc_info=True)
        audio_buffer.clear()
        try:
            await manager.send(ws, "error", {"message": "Erreur interne du serveur."})
        except Exception:
            pass
    finally:
        alert_task.cancel()
        _monitor_unsubscribe(alert_queue)
        _rate_limiter.cleanup(ws_id)
        _system_cache.pop(id(memory), None)
        manager.disconnect(ws)
