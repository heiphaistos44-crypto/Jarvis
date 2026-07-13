from __future__ import annotations
import asyncio
import subprocess
import base64
import tempfile
import time
import re as _re
from pathlib import Path
from typing import TYPE_CHECKING
from utils.logger import get_logger

_SENTENCE_END = _re.compile(r'(?<=[.!?…»])\s+|(?<=[.!?…»])$')

if TYPE_CHECKING:
    from utils.config import Settings

logger = get_logger("tts")

MAX_TTS_CHARS = 1000

# Voix masculines connues dans les modèles Piper multi-locuteurs
_MALE_SPEAKERS = {"pierre", "tom", "gilles", "male"}


def _male_speaker_id(voice_path: Path) -> int | None:
    """ID du locuteur masculin d'un modèle multi-speakers, sinon None.

    fr_FR-upmc-medium contient jessica (0, défaut Piper !) et pierre (1) —
    sans --speaker, Piper parle avec la voix féminine.
    """
    import json
    config_path = Path(str(voice_path) + ".json")
    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8"))
        if int(cfg.get("num_speakers", 1)) <= 1:
            return None
        speaker_map: dict[str, int] = cfg.get("speaker_id_map", {})
        for name, sid in speaker_map.items():
            if name.lower() in _MALE_SPEAKERS:
                return int(sid)
    except Exception:
        pass
    return None


class TTSManager:
    """Deux moteurs : Edge-TTS (voix neurales naturelles, en ligne) et Piper
    (local). Si la voix active est Edge et que le réseau échoue, bascule
    automatiquement sur Piper — JARVIS ne devient jamais muet."""

    _EDGE_COOLDOWN_S = 60.0  # après un échec, rester sur Piper (voix cohérente)

    def __init__(self, settings: "Settings") -> None:
        self._piper_exe = settings.piper_exe
        self._voice = settings.piper_voice
        self._speaker: int | None = _male_speaker_id(settings.piper_voice)
        self._edge_voice: str | None = None
        self._edge_down_until: float = 0.0
        self._piper_ok = self._piper_exe.exists() and self._voice.exists()
        if not self._piper_ok:
            logger.warning(
                "Piper TTS non disponible — placez piper.exe + voix .onnx dans server/models/piper/"
            )

    @property
    def is_available(self) -> bool:
        return self._piper_ok or self._edge_voice is not None

    def set_voice(self, voice_path: Path) -> None:
        self._edge_voice = None
        self._voice = voice_path
        self._speaker = _male_speaker_id(voice_path)
        self._piper_ok = self._piper_exe.exists() and voice_path.exists()
        logger.info(f"Voix TTS changée: {voice_path.name} (speaker={self._speaker})")

    def set_edge_voice(self, voice_name: str) -> None:
        """Active une voix neurale Edge-TTS (ex. fr-FR-HenriNeural)."""
        self._edge_voice = voice_name
        # Le secours Piper doit rester cohérent avec la voix Edge (masculine) —
        # jamais de bascule vers une voix féminine choisie précédemment.
        default_male = self._piper_exe.parent / "fr_FR-upmc-medium.onnx"
        if default_male.exists():
            self._voice = default_male
            self._speaker = _male_speaker_id(default_male)
            self._piper_ok = self._piper_exe.exists()
        logger.info(f"Voix TTS changée: {voice_name} (Edge, secours Piper {self._voice.stem})")

    async def _synthesize_edge(self, text: str) -> str:
        import edge_tts  # type: ignore[import]
        communicate = edge_tts.Communicate(text, self._edge_voice)
        buf = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf += chunk["data"]
        if not buf:
            raise RuntimeError("Edge-TTS: flux audio vide")
        return base64.b64encode(buf).decode()  # MP3 — décodé par WebAudio côté client

    @staticmethod
    def split_sentences(text: str) -> list[str]:
        """Découpe le texte en phrases sur ponctuation forte."""
        parts = _SENTENCE_END.split(text.strip())
        return [p.strip() for p in parts if p.strip()]

    async def synthesize(self, text: str) -> str | None:
        if not self.is_available:
            return None

        text = text[:MAX_TTS_CHARS]

        if self._edge_voice is not None and time.monotonic() >= self._edge_down_until:
            # 2 tentatives : Microsoft coupe parfois les connexions en rafale
            # (une par phrase) — un retry absorbe la quasi-totalité des échecs.
            for attempt in (1, 2):
                try:
                    audio = await asyncio.wait_for(self._synthesize_edge(text), timeout=10)
                    logger.debug(f"TTS Edge OK: {len(text)} chars")
                    return audio
                except Exception as e:
                    if attempt == 1:
                        await asyncio.sleep(0.4)
                        continue
                    # Cooldown : voix Piper cohérente pendant 60 s plutôt
                    # qu'une alternance Henri/Piper phrase par phrase.
                    self._edge_down_until = time.monotonic() + self._EDGE_COOLDOWN_S
                    logger.warning(f"Edge-TTS en panne ({e}) — Piper pendant 60 s")
            if not self._piper_ok:
                return None

        def _run() -> bytes:
            tmp_path: Path | None = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp_path = Path(tmp.name)

                cmd = [
                    str(self._piper_exe),
                    "--model", str(self._voice),
                    "--output_file", str(tmp_path),
                ]
                if self._speaker is not None:
                    cmd += ["--speaker", str(self._speaker)]
                proc = subprocess.run(
                    cmd,
                    input=text.encode("utf-8"),
                    capture_output=True,
                    timeout=30,
                )
                if proc.returncode != 0:
                    raise RuntimeError(f"Piper error: {proc.stderr.decode()}")
                return tmp_path.read_bytes()
            finally:
                if tmp_path is not None:
                    tmp_path.unlink(missing_ok=True)

        try:
            wav_bytes = await asyncio.to_thread(_run)
            logger.debug(f"TTS OK: {len(wav_bytes)} bytes pour {len(text)} chars")
            return base64.b64encode(wav_bytes).decode()
        except Exception as e:
            logger.error(f"TTS synthèse échouée: {e}")
            return None
