import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, Wrench, ShieldCheck } from "lucide-react";
import { useJarvisStore } from "../../stores/jarvisStore";
import type { AgentPhase } from "../../types";

const PHASE_CONF: Record<Exclude<AgentPhase, "done">, { icon: typeof BrainCircuit; color: string; label: string }> = {
  thinking: { icon: BrainCircuit, color: "#00d4ff", label: "RÉFLEXION" },
  tool: { icon: Wrench, color: "#ffaa00", label: "OUTIL" },
  verify: { icon: ShieldCheck, color: "#00ff88", label: "VÉRIFICATION" },
};

/** Timeline temps réel de la boucle agent (réflexion → outils → vérification). */
export function AgentSteps() {
  const steps = useJarvisStore((s) => s.agentSteps);
  const status = useJarvisStore((s) => s.status);

  if (steps.length === 0 || status === "idle" || status === "standby") return null;

  return (
    <div className="px-4 pb-1">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded overflow-x-auto"
        style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}
      >
        <span className="text-[8px] tracking-[0.3em] text-cyan-600 shrink-0">FABLE</span>
        <AnimatePresence initial={false}>
          {steps.slice(-6).map((step, i, arr) => {
            const conf = PHASE_CONF[step.phase as Exclude<AgentPhase, "done">];
            if (!conf) return null;
            const Icon = conf.icon;
            const isLast = i === arr.length - 1;
            return (
              <motion.div
                key={step.timestamp + step.phase}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: isLast ? 1 : 0.45, x: 0 }}
                className="flex items-center gap-1.5 shrink-0"
              >
                <motion.div
                  animate={isLast ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Icon size={11} style={{ color: conf.color }} />
                </motion.div>
                <span className="text-[9px] tracking-wider font-mono" style={{ color: conf.color }}>
                  {conf.label}
                  {step.detail ? ` · ${step.detail}` : ""}
                </span>
                {!isLast && <span className="text-cyan-800 text-[9px]">›</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
