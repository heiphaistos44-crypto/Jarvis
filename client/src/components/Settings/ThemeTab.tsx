import { useJarvisStore, THEMES, accentOf } from "../../stores/jarvisStore";
import type { ThemeName, HoloStyle, HoloDensity, HoloSpeed } from "../../stores/jarvisStore";
import {
  Globe2, Disc3, Sparkles, PanelLeft, PanelRight, Dna, Grid3x3, Tornado,
  Pipette, Snowflake, Turtle, Rabbit,
} from "lucide-react";

const HOLO_OPTIONS: { id: HoloStyle; label: string; description: string; icon: typeof Globe2 }[] = [
  { id: "sphere", label: "Sphère orbitale", description: "Sphère de particules + anneaux gyroscopiques", icon: Globe2 },
  { id: "reactor", label: "Réacteur Arc", description: "Anneaux concentriques face à vous, cœur intense", icon: Disc3 },
  { id: "galaxy", label: "Nébuleuse", description: "Galaxie spirale à 3 bras en rotation", icon: Sparkles },
  { id: "dna", label: "Hélice ADN", description: "Double hélice verticale avec barreaux", icon: Dna },
  { id: "matrix", label: "Matrice", description: "Cube holographique de points en grille", icon: Grid3x3 },
  { id: "vortex", label: "Vortex", description: "Tourbillon conique en rotation rapide", icon: Tornado },
];

const DENSITY_OPTIONS: { id: HoloDensity; label: string }[] = [
  { id: "low", label: "Légère" },
  { id: "normal", label: "Normale" },
  { id: "high", label: "Dense" },
];

const SPEED_OPTIONS: { id: HoloSpeed; label: string; icon: typeof Turtle }[] = [
  { id: "slow", label: "Lente", icon: Turtle },
  { id: "normal", label: "Normale", icon: Snowflake },
  { id: "fast", label: "Rapide", icon: Rabbit },
];

/** Onglet THÈME — palette (+couleur libre), hologramme, densité, vitesse, disposition. */
export function ThemeTab() {
  const theme = useJarvisStore((s) => s.theme);
  const setTheme = useJarvisStore((s) => s.setTheme);
  const customAccent = useJarvisStore((s) => s.customAccent);
  const setCustomAccent = useJarvisStore((s) => s.setCustomAccent);
  const holoStyle = useJarvisStore((s) => s.holoStyle);
  const setHoloStyle = useJarvisStore((s) => s.setHoloStyle);
  const holoDensity = useJarvisStore((s) => s.holoDensity);
  const setHoloDensity = useJarvisStore((s) => s.setHoloDensity);
  const holoSpeed = useJarvisStore((s) => s.holoSpeed);
  const setHoloSpeed = useJarvisStore((s) => s.setHoloSpeed);
  const layoutSide = useJarvisStore((s) => s.layoutSide);
  const setLayoutSide = useJarvisStore((s) => s.setLayoutSide);

  const accent = accentOf(theme, customAccent);

  return (
    <div className="flex flex-col gap-5">
      {/* Palette */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-blue-400/40">PALETTE</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(THEMES) as ThemeName[])
            .filter((n) => n !== "custom")
            .map((name) => {
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

        {/* Couleur personnalisée */}
        <label
          className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all"
          style={{
            background: theme === "custom" ? `${customAccent}14` : "rgba(255,255,255,0.02)",
            border: `1px solid ${theme === "custom" ? `${customAccent}66` : "rgba(255,255,255,0.06)"}`,
          }}
        >
          <Pipette size={14} style={{ color: theme === "custom" ? customAccent : "#ffffff55" }} />
          <span className="text-[10px] tracking-wider flex-1"
            style={{ color: theme === "custom" ? customAccent : "#ffffff77" }}>
            Couleur personnalisée
          </span>
          <input
            type="color"
            value={customAccent}
            onChange={(e) => {
              setCustomAccent(e.target.value);
              setTheme("custom");
            }}
            onClick={() => setTheme("custom")}
            className="w-8 h-6 rounded cursor-pointer bg-transparent border-0"
          />
        </label>
      </div>

      {/* Style d'hologramme */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-blue-400/40">HOLOGRAMME</div>
        <div className="grid grid-cols-2 gap-1.5">
          {HOLO_OPTIONS.map(({ id, label, description, icon: Icon }) => {
            const isActive = holoStyle === id;
            return (
              <button
                key={id}
                onClick={() => setHoloStyle(id)}
                title={description}
                className="flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                style={{
                  background: isActive ? `${accent}14` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={15} style={{ color: isActive ? accent : "#ffffff44" }} />
                <span className="text-[10px] tracking-wider"
                  style={{ color: isActive ? accent : "#ffffff77" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Densité + vitesse */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-[9px] tracking-widest text-blue-400/40">DENSITÉ</div>
          <div className="flex gap-1">
            {DENSITY_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setHoloDensity(id)}
                className="flex-1 py-1.5 rounded-lg text-[9px] tracking-wider transition-all"
                style={{
                  background: holoDensity === id ? `${accent}18` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${holoDensity === id ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
                  color: holoDensity === id ? accent : "#ffffff66",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[9px] tracking-widest text-blue-400/40">VITESSE</div>
          <div className="flex gap-1">
            {SPEED_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setHoloSpeed(id)}
                title={label}
                className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all"
                style={{
                  background: holoSpeed === id ? `${accent}18` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${holoSpeed === id ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={13} style={{ color: holoSpeed === id ? accent : "#ffffff55" }} />
              </button>
            ))}
          </div>
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
                  background: isActive ? `${accent}14` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={14} style={{ color: isActive ? accent : "#ffffff44" }} />
                <span className="text-[9px] tracking-wider"
                  style={{ color: isActive ? accent : "#ffffff77" }}>
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
