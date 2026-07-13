import { useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useAudioCapture } from "./useAudioCapture";
import { useWakeWord } from "./useWakeWord";
import { useJarvisStore } from "../stores/jarvisStore";

export function useJarvis() {
  const { send } = useWebSocket();
  const isMicActive = useJarvisStore((s) => s.isMicActive);
  const status = useJarvisStore((s) => s.status);
  const { startCapture, stopCapture } = useAudioCapture(send);

  const activateMic = useCallback(async () => {
    try {
      await startCapture();
      useJarvisStore.getState().setMicActive(true);
    } catch {
      useJarvisStore.getState().setMicActive(false);
    }
  }, [startCapture]);

  // Mode veille « Hey Jarvis » → active le micro à la détection
  useWakeWord(send, activateMic);

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send({
        type: "text_query",
        payload: { text, council: useJarvisStore.getState().councilEnabled },
      });
    },
    [send]
  );

  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      stopCapture();
      useJarvisStore.getState().setMicActive(false);
    } else {
      await activateMic();
    }
  }, [isMicActive, activateMic, stopCapture]);

  return { sendText, toggleMic, isMicActive, status };
}
