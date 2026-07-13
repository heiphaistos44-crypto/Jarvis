from __future__ import annotations
import asyncio
import time

import numpy as np

from utils.logger import get_logger

logger = get_logger("wakeword")

_MODEL_NAME = "hey_jarvis_v0.1"
_FRAME_SAMPLES = 1280          # 80 ms à 16 kHz — taille attendue par openwakeword
_DETECTION_THRESHOLD = 0.5
_COOLDOWN_S = 2.0              # anti re-déclenchement pendant la même phrase


class WakeWordDetector:
    """Détecteur « Hey Jarvis » local (openwakeword ONNX, CPU).

    Une instance par connexion WebSocket : le modèle openwakeword est stateful
    (buffer interne de features audio).
    """

    def __init__(self) -> None:
        self._model: object | None = None
        self._pending = np.empty(0, dtype=np.int16)
        self._last_detection = 0.0
        self._load()

    def _load(self) -> None:
        try:
            from openwakeword.model import Model
            self._model = Model(
                wakeword_models=[_MODEL_NAME],
                inference_framework="onnx",
            )
            logger.info(f"Wake word chargé: {_MODEL_NAME}")
        except Exception as e:
            logger.warning(f"openwakeword indisponible ({e}) — wake word désactivé")

    @property
    def is_available(self) -> bool:
        return self._model is not None

    def _process_sync(self, samples: np.ndarray) -> float:
        """Découpe en frames de 1280 échantillons et renvoie le meilleur score."""
        self._pending = np.concatenate([self._pending, samples])
        best = 0.0
        while len(self._pending) >= _FRAME_SAMPLES:
            frame, self._pending = (
                self._pending[:_FRAME_SAMPLES],
                self._pending[_FRAME_SAMPLES:],
            )
            scores = self._model.predict(frame)  # type: ignore[union-attr]
            best = max(best, float(scores.get(_MODEL_NAME, 0.0)))
        return best

    async def feed(self, chunk: list[float], sample_rate: int) -> bool:
        """Ingère un chunk audio float32 [-1,1]. True si « Hey Jarvis » détecté."""
        if self._model is None or not chunk:
            return False

        samples = np.asarray(chunk, dtype=np.float32)
        if sample_rate != 16000 and sample_rate > 0:
            # Rééchantillonnage linéaire léger — suffisant pour la détection
            target = int(len(samples) * 16000 / sample_rate)
            if target <= 0:
                return False
            samples = np.interp(
                np.linspace(0, len(samples) - 1, target),
                np.arange(len(samples)),
                samples,
            )
        int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)

        score = await asyncio.to_thread(self._process_sync, int16)

        now = time.monotonic()
        if score >= _DETECTION_THRESHOLD and (now - self._last_detection) > _COOLDOWN_S:
            self._last_detection = now
            logger.info(f"« Hey Jarvis » détecté (score={score:.2f})")
            self.reset()
            return True
        return False

    def reset(self) -> None:
        """Purge les buffers (à appeler quand le client sort du mode veille)."""
        self._pending = np.empty(0, dtype=np.int16)
        if self._model is not None:
            try:
                self._model.reset()  # type: ignore[union-attr]
            except Exception:
                pass
