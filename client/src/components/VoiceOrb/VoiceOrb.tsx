import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useJarvisStore, getTtsAnalyser } from "../../stores/jarvisStore";

const ORB_STATES = {
  listening: { color: "#ff4455", halo: "#ff8899", label: "ÉCOUTE" },
  processing: { color: "#ffaa00", halo: "#ffd580", label: "ANALYSE" },
  speaking: { color: "#00ff88", halo: "#7fffc8", label: "PAROLE" },
} as const;

type OrbStatus = keyof typeof ORB_STATES;

/** Hologramme vocal compact — orbe flottant en bas à droite pendant
 *  écoute / analyse / parole. Ne couvre pas la page, ne bloque rien. */
export function VoiceOrb() {
  const status = useJarvisStore((s) => s.status);
  const isMicActive = useJarvisStore((s) => s.isMicActive);

  const orbStatus: OrbStatus | null =
    isMicActive && (status === "listening" || status === "processing" || status === "speaking")
      ? status
      : null;

  return (
    <AnimatePresence>
      {orbStatus && <CompactOrb orbStatus={orbStatus} />}
    </AnimatePresence>
  );
}

function CompactOrb({ orbStatus }: { orbStatus: OrbStatus }) {
  const scaleRef = useRef<HTMLDivElement>(null);
  const conf = ORB_STATES[orbStatus];

  // Réaction audio quand JARVIS parle
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
        scaleRef.current.style.transform = `scale(${1 + level * 0.4})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [orbStatus]);

  return (
    <motion.div
      className="fixed bottom-24 right-8 z-40 flex flex-col items-center gap-2 pointer-events-none"
      initial={{ opacity: 0, scale: 0.5, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: 20 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <div className="relative w-28 h-28">
        {/* Halo conique tournant */}
        <motion.div
          className="absolute -inset-2 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${conf.color}00, ${conf.halo}77, ${conf.color}00 60%)`,
            filter: "blur(10px)",
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
                background: `radial-gradient(circle at ${40 + i * 12}% ${45 + i * 8}%, ${conf.halo}bb, ${conf.color}44 60%, transparent 75%)`,
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
            className="absolute inset-[32%] rounded-full"
            style={{
              background: `radial-gradient(circle, #ffffffdd, ${conf.color}77 70%)`,
              boxShadow: `0 0 30px ${conf.color}88`,
            }}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        </div>
      </div>

      <motion.span
        className="text-[9px] tracking-[0.4em] font-bold px-2.5 py-1 rounded-full"
        style={{
          color: conf.color,
          textShadow: `0 0 10px ${conf.color}`,
          background: "rgba(2,10,24,0.6)",
          border: `1px solid ${conf.color}33`,
          backdropFilter: "blur(8px)",
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        {conf.label}
      </motion.span>
    </motion.div>
  );
}
