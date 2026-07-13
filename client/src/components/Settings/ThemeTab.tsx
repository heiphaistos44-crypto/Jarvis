import { useJarvisStore, THEMES } from "../../stores/jarvisStore";
import type { ThemeName, HoloStyle } from "../../stores/jarvisStore";
import { Globe2, Disc3, Sparkles, PanelLeft, PanelRight } from "lucide-react";

const HOLO_OPTIONS: { id: HoloStyle; label: string; description: string; icon: typeof Globe2 }[] = [
  { id: "sphere", label: "Sphère orbitale", description: "Sphère de particules + anneaux gyroscopiques", icon: Globe2 },
  { id: "reactor", label: "Réacteur Arc", description: "Anneaux concentriques face à vous, cœur intense", icon: Disc3 },
  { id: "galaxy", label: "Nébuleuse", description: "Galaxie spirale à 3 bras en rotation", icon: Sparkles },
];

/** Onglet THÈME — couleur d'accent, style d'hologramme, disposition. */
export function ThemeTab() {
  const theme = useJarvisStore((s) => s.theme);
  const setTheme = useJarvisStore((s) => s.setTheme);
  const holoStyle = useJarvisStore((s) => s.holoStyle);
  const setHoloStyle = useJarvisStore((s) => s.setHoloStyle);
  const layoutSide = useJarvisStore((s) => s.layoutSide);
  const setLayoutSide = useJarvisStore((s) => s.setLayoutSide);

  return (
    <div className="flex flex-col gap-5">
      {/* Couleur d'accent */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-blue-400/40">PALETTE</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(THEMES) as ThemeName[]).map((name) => {
            const t = THEMES[name];
            const isActive = theme === name;
            return (
              <button
                key={name}
                onClick={() => setTheme(name)}
                className="flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                style={{
                  background: isActive ? `${t.accent}14` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? `${t.accent}55` : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${t.accent}, ${t.accentSoft})`,
                    boxShadow: isActive ? `0 0 10px ${t.accent}88` : "none",
                  }}
                />
                <span className="text-[10px] tracking-wider"
                  style={{ color: isActive ? t.accent : "#ffffff77" }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Style d'hologramme */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-blue-400/40">HOLOGRAMME</div>
        <div className="flex flex-col gap-1.5">
          {HOLO_OPTIONS.map(({ id, label, description, icon: Icon }) => {
            const isActive = holoStyle === id;
            return (
              <button
                key={id}
                onClick={() => setHoloStyle(id)}
                className="flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                style={{
                  background: isActive ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={16} className={isActive ? "text-cyan-400" : "text-blue-400/40"} />
                <div>
                  <div className="text-[11px] font-bold tracking-wider"
                    style={{ color: isActive ? "#00d4ff" : "#ffffff77" }}>
                    {label}
                  </div>
                  <div className="text-[9px] text-blue-400/35">{description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Disposition */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-blue-400/40">DISPOSITION</div>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { id: "left" as const, label: "Hologramme à gauche", icon: PanelLeft },
            { id: "right" as const, label: "Hologramme à droite", icon: PanelRight },
          ]).map(({ id, label, icon: Icon }) => {
            const isActive = layoutSide === id;
            return (
              <button
                key={id}
                onClick={() => setLayoutSide(id)}
                className="flex items-center gap-2 p-2.5 rounded-xl transition-all"
                style={{
                  background: isActive ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={14} className={isActive ? "text-cyan-400" : "text-blue-400/40"} />
                <span className="text-[9px] tracking-wider"
                  style={{ color: isActive ? "#00d4ff" : "#ffffff77" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
