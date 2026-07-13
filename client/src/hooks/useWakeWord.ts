import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useJarvisStore } from "../stores/jarvisStore";
import type { ClientEvent } from "../types";

interface AudioChunkPayload {
  data: number[];
  sampleRate: number;
}

/** Bip de confirmation « Hey Jarvis » — deux notes montantes, WebAudio pur. */
function playWakeChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio non critique
  }
}

/** Mode veille « Hey Jarvis » : capture micro en continu, frames envoyées en
 *  wake_audio (analysées côté serveur, jamais transcrites). À la détection,
 *  bascule sur l'écoute STT normale via onWake(). */
export function useWakeWord(
  send: (e: ClientEvent) => void,
  onWake: () => Promise<void>,
) {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const standbyActiveRef = useRef(false);

  const wakeWordEnabled = useJarvisStore((s) => s.wakeWordEnabled);
  const wakeWordAvailable = useJarvisStore((s) => s.wakeWordAvailable);
  const isConnected = useJarvisStore((s) => s.isConnected);
  const sttAvailable = useJarvisStore((s) => s.sttAvailable);
  const isMicActive = useJarvisStore((s) => s.isMicActive);
  const status = useJarvisStore((s) => s.status);
  const wakeDetected = useJarvisStore((s) => s.wakeDetected);

  const stopStandby = useCallback(async () => {
    if (!standbyActiveRef.current) return;
    standbyActiveRef.current = false;
    unlistenRef.current?.();
    unlistenRef.current = null;
    try {
      await invoke("stop_mic");
    } catch {
      // déjà arrêté
    }
    send({ type: "wake_reset", payload: {} });
    if (useJarvisStore.getState().status === "standby") {
      useJarvisStore.getState().setStatus("idle");
    }
  }, [send]);

  const startStandby = useCallback(async () => {
    if (standbyActiveRef.current) return;
    standbyActiveRef.current = true;
    try {
      unlistenRef.current = await listen<AudioChunkPayload>(
        "jarvis_audio_chunk",
        (event) => {
          const { data, sampleRate } = event.payload;
          send({ type: "wake_audio", payload: { data, sampleRate } });
        },
      );
      await invoke("start_mic");
      useJarvisStore.getState().setStatus("standby");
      console.log("[JARVIS-WAKE] Mode veille actif — dites « Hey Jarvis »");
    } catch (e) {
      console.warn("[JARVIS-WAKE] Échec démarrage veille (retry dans 4 s):", e);
      standbyActiveRef.current = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }, [send]);

  // Entrée/sortie du mode veille selon l'état global
  const shouldStandby =
    wakeWordEnabled &&
    wakeWordAvailable &&
    isConnected &&
    sttAvailable &&
    !isMicActive &&
    (status === "idle" || status === "standby");

  useEffect(() => {
    if (shouldStandby) {
      void startStandby();
      // Retry périodique : si start_mic a échoué (périphérique occupé au
      // moment du basculement), la veille se réarme toute seule.
      const retry = window.setInterval(() => {
        if (!standbyActiveRef.current) void startStandby();
      }, 4000);
      return () => clearInterval(retry);
    } else if (standbyActiveRef.current && !wakeDetected) {
      void stopStandby();
    }
  }, [shouldStandby, wakeDetected, startStandby, stopStandby]);

  // « Hey Jarvis » détecté → chime + bascule en écoute réelle
  useEffect(() => {
    if (!wakeDetected) return;
    void (async () => {
      playWakeChime();
      await stopStandby();
      useJarvisStore.getState().consumeWakeDetected();
      await onWake();
    })();
  }, [wakeDetected, stopStandby, onWake]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      void stopStandby();
    };
  }, [stopStandby]);
}
