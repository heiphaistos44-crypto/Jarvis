# JARVIS v4.0 — Fable Core + Cinematic HUD

Date : 2026-07-13 · Version cible : 3.1.0 → 4.0.0 · Validé par Monsieur.

## Objectif

Transformer JARVIS en assistant agentique de niveau « Fable » (boucle plan→agir→vérifier,
skills routés, mémoire leçons), supportant **n'importe quelle API LLM**, avec wake-word
« Hey Jarvis » et une interface cinématique Iron Man (boot sequence, hologramme 3D, HUD).

Patterns portés (crédités MIT dans README) : UI 3D/boot de `harsh-raj00/my-jarvis`,
multi-provider de `hzaid01/Jarvis`. Aucune régression du mode 100 % local.

## 1. Multi-provider LLM — `server/core/providers/`

- `base.py` — `LLMProvider` (ABC) : `async stream(messages, max_tokens) -> AsyncGenerator[str]`,
  propriétés `is_available`, `name`, `model`. Contrat identique à `LLMManager.stream` actuel
  (le tool-calling reste au format balises `<JARVIS_TOOL>` pour tous les providers —
  uniforme, déjà robuste, zéro refactor de la boucle agent).
- `local_llama.py` — adapte le `LLMManager` existant (défaut, hors-ligne).
- `anthropic_provider.py` — API Messages Anthropic native via httpx SSE (system prompt séparé).
- `openai_compat.py` — `/chat/completions` SSE avec `base_url` configurable.
  Couvre : OpenAI, Gemini (endpoint openai/), Ollama, Groq, DeepSeek, xAI, OpenRouter,
  Mistral API, LM Studio, vLLM… = « n'importe quelle API ».
- `manager.py` — `ProviderManager` : provider actif, presets connus, config persistée dans
  `server/data/providers.json` (clés API **côté serveur uniquement**, fichier .gitignoré),
  fallback automatique sur local si le provider cloud échoue.
- REST : `GET /api/providers` (liste + actif, clés masquées), `POST /api/providers`
  (configure/switch, localhost only). WS : `server_status` enrichi avec `provider`.

## 2. Cerveau Fable — skills + lessons + agent steps

- `server/skills/*.md` : 6 disciplines distillées (deep-reasoning, calibrated-judgment,
  verification-discipline, communicating-results, token-economy, memory-discipline),
  frontmatter `name/description/triggers/always`, corps ≤ 400 chars chacun (compact 7B).
  Deux variantes injectées selon provider : compacte (local) / complète (cloud).
- `server/core/skills.py` : loader auto-discovery + router par mots-clés d'intent ;
  skills `always: true` toujours injectés, les autres si trigger match.
- `persistent_memory.py` : table `lessons(id, context, lesson, created_at)` +
  `record_lesson()`, `get_lessons_summary()` injecté au system prompt.
  La boucle agent enregistre une leçon automatique quand un outil échoue puis réussit
  différemment, ou après 2 échecs du même outil.
- Boucle agent (`websocket.py`) : émet `agent_step {phase: thinking|tool|verify|done, detail}`
  au client à chaque itération → panneau raisonnement HUD.
- Étape « vérifier » : pour les réponses ayant utilisé ≥1 outil sur provider cloud,
  passe de relecture courte (le 7B local la saute — coût/bénéfice).

## 3. Wake-word « Hey Jarvis » — `server/core/wakeword.py`

- `openwakeword` (pip, ONNX CPU) modèle pré-entraîné `hey_jarvis_v0.1`.
- Client (mode veille activé) : capture continue 16 kHz, frames envoyées en WS
  `wake_audio` (rate-limitées, jamais bufferisées pour STT).
- Serveur : détecteur par connexion, score > 0.5 → événement `wake` → le client joue
  un chime, passe en écoute STT normale. Toggle dans Settings + statut HUD « VEILLE ».
- Dépendance optionnelle : si openwakeword absent, feature désactivée proprement.

## 4. UI cinématique — client

Dépendances : `three`, `@react-three/fiber`, `@react-three/drei`.

- `components/Boot/BootSequence.tsx` : splash Stark Industries, lignes d'init terminal
  (checks réels : WS, LLM, STT, TTS depuis server_status), arc reactor qui s'allume,
  skippable (clic), joué une fois par session.
- `components/Scene/JarvisScene.tsx` (+ sous-composants ParticleSphere, OrbitalRings,
  HoloCore) : sphère ~6000 particules cyan, anneaux orbitaux, audio-réactif branché sur
  `getTtsAnalyser()` existant ; états visuels idle/listening/thinking/speaking.
- Thème HUD : `styles/hud.css` — palette cyan/#0af sur fond #020810, scanlines,
  corner brackets, glassmorphism panels, fonts Orbitron/JetBrains Mono (bundlées locales).
- `components/VoiceOrb/VoiceOrb.tsx` : overlay plein écran audio-réactif,
  rouge écoute / ambre réflexion / vert parole, entrée-sortie Framer Motion.
- `components/AgentSteps/AgentSteps.tsx` : timeline des `agent_step` en direct.
- Settings enrichi : sélection provider (Local/Anthropic/OpenAI-compatible + presets),
  base_url, clé API (write-only, jamais relue), modèle, toggle wake-word.
- Métriques CPU/RAM/GPU live (polling `/api/system_info` existant) dans panneau HUD.

## 5. Auto-discovery des outils

`ToolRegistry` scanne les modules de `server/tools/` et enregistre toute fonction
décorée `@tool` (décorateur trivial posé sur les 28 outils existants). Ajout d'un
fichier = outil disponible, fini la liste manuelle.

## 6. Sécurité

Clés API jamais dans le client ni en git (`data/providers.json` .gitignoré, masquées en
lecture API) · endpoints REST bind 127.0.0.1 existant · timeouts httpx 60 s providers
cloud · rate limiting existant conservé, wake_audio compté comme audio · pas de stack
trace au client (messages génériques conservés).

## 7. Tests & vérification

pytest : parse_tool_call (existant), skills router, ProviderManager (persistance,
masquage clés, fallback), openai_compat/anthropic parsing SSE (httpx mocké), registry
auto-discovery (28 outils trouvés). Client : `tsc --noEmit` + `npm run build`.
Vérification manuelle : dev run backend + tauri dev.

## Hors périmètre v4.0

Vision caméra, bridge Telegram, widget flottant Tauri multi-fenêtres, contrôle domotique.
