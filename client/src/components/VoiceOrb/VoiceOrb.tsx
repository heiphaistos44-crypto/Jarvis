import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJarvisStore, getTtsAnalyser } from "../../stores/jarvisStore";

const ORB_STATES = {
  listening: { color: "#ff4455", halo: "#ff8899", label: "JE VOUS ÉCOUTE, MONSIEUR" },
  processing: { color: "#ffaa00", halo: "#ffd580", label: "ANALYSE EN COURS" },
  speaking: { color: "#00ff88", halo: "#7fffc8", label: "" },
} as const;

type OrbStatus = keyof typeof ORB_STATES;

/** Overlay plein écran type Siri — blobs morphants audio-réactifs.
 *  Visible pendant écoute / réflexion / parole (micro actif uniquement). */
export function VoiceOrb() {
  const status = useJarvisStore((s) => s.status);
  const isMicActive = useJarvisStore((s) => s.isMicActive);

  const orbStatus: OrbStatus | null =
    isMicActive && (status === "listening" || status === "processing" || status === "speaking")
      ? status
      : null;

  return (
    <AnimatePresence>
      {orbStatus && <OrbOverlay orbStatus={orbStatus} />}
    </AnimatePresence>
  );
}

function OrbOverlay({ orbStatus }: { orbStatus: OrbStatus }) {
  const scaleRef = useRef<HTMLDivElement>(null);
  const conf = ORB_STATES[orbStatus];

  // Réaction audio : TTS analyser quand JARVIS parle
  useEffect(() => {
    if (orbStatus !== "speaking") return;
    const buf = new Uint8Array(256);
    let raf = 0;
    const tick = () => {
      const analyser = getTtsAnalyser();
      if (analyser && scaleRef.current) {
        analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const level = sum / (buf.length * 255);
        scaleRef.current.style.transform = `scale(${1 + level * 0.45})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [orbStatus]);

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 pointer-events-none"
      style={{ background: "rgba(1, 8, 16, 0.82)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="relative w-56 h-56"
      >
        {/* Halo conique tournant */}
        <motion.div
          className="absolute -inset-4 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${conf.color}00, ${conf.halo}88, ${conf.color}00 60%)`,
            filter: "blur(14px)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
        />
        <div ref={scaleRef} className="absolute inset-0 transition-transform duration-75">
          {/* Blobs morphants superposés */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at ${40 + i * 12}% ${45 + i * 8}%, ${conf.halo}cc, ${conf.color}44 60%, transparent 75%)`,
                borderRadius: "50%",
                mixBlendMode: "screen",
              }}
              animate={{
                borderRadius: [
                  "58% 42% 55% 45% / 45% 55% 45% 55%",
                  "45% 55% 42% 58% / 55% 45% 58% 42%",
                  "58% 42% 55% 45% / 45% 55% 45% 55%",
                ],
                rotate: [0, i % 2 === 0 ? 120 : -120, 0],
              }}
              transition={{ duration: 4 + i * 1.3, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
          {/* Cœur lumineux */}
          <motion.div
            className="absolute inset-[30%] rounded-full"
            style={{
              background: `radial-gradient(circle, #ffffffee, ${conf.color}88 70%)`,
              boxShadow: `0 0 50px ${conf.color}aa`,
            }}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        </div>
      </motion.div>

      {conf.label && (
        <motion.p
          className="text-xs tracking-[0.45em] font-bold"
          style={{ color: conf.color, textShadow: `0 0 14px ${conf.color}` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          {conf.label}
        </motion.p>
      )}
    </motion.div>
  );
}
