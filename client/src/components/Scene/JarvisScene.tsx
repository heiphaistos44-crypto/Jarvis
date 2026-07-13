import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useJarvisStore, getTtsAnalyser, THEMES } from "../../stores/jarvisStore";
import type { HoloStyle } from "../../stores/jarvisStore";
import type { JarvisStatus } from "../../types";

const PARTICLE_COUNT = 6000;

/** Couleur pilotée par le statut — idle suit l'accent du thème actif. */
function statusColor(status: JarvisStatus): string {
  const accent = THEMES[useJarvisStore.getState().theme].accent;
  const map: Record<JarvisStatus, string> = {
    idle: accent,
    standby: "#3388cc",
    listening: "#00ff88",
    processing: "#ffaa00",
    speaking: "#8866ff",
    error: "#ff3333",
  };
  return map[status];
}

/** Niveau audio TTS [0,1] — 0 si pas d'analyseur ou silence. */
function readTtsLevel(buf: Uint8Array): number {
  const analyser = getTtsAnalyser();
  if (!analyser) return 0;
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / (buf.length * 255);
}

// ── Générateurs de nuages de points par style ────────────────────────────────

function genSphere(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Distribution uniforme sur la sphère (méthode de Marsaglia)
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 1.55 + (Math.random() - 0.5) * 0.12;
    pos[i * 3] = s * Math.cos(theta) * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = s * Math.sin(theta) * r;
  }
  return pos;
}

function genReactor(): Float32Array {
  // Anneaux concentriques denses face caméra + moyeu central — arc reactor
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ring = i % 4;
    const theta = Math.random() * Math.PI * 2;
    let r: number;
    if (ring === 0) r = 0.35 + Math.random() * 0.25;            // moyeu
    else r = 0.9 + ring * 0.42 + (Math.random() - 0.5) * 0.1;   // 3 anneaux
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = Math.sin(theta) * r;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.14;
  }
  return pos;
}

function genGalaxy(): Float32Array {
  // Spirale à 3 bras, légèrement bombée au centre
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const ARMS = 3;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const arm = i % ARMS;
    const t = Math.pow(Math.random(), 0.6);            // densité vers le centre
    const r = 0.25 + t * 2.1;
    const spin = t * 4.2;                               // enroulement
    const theta = (arm / ARMS) * Math.PI * 2 + spin + (Math.random() - 0.5) * 0.45;
    const thickness = (1 - t) * 0.32 + 0.04;
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * thickness;
    pos[i * 3 + 2] = Math.sin(theta) * r;
  }
  return pos;
}

const GENERATORS: Record<HoloStyle, () => Float32Array> = {
  sphere: genSphere,
  reactor: genReactor,
  galaxy: genGalaxy,
};

function ParticleCloud({ style }: { style: HoloStyle }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useMemo(() => new Uint8Array(256), []);
  const color = useRef(new THREE.Color(statusColor("idle")));

  const positions = useMemo(() => GENERATORS[style](), [style]);

  useFrame(({ clock }) => {
    if (!points.current || !material.current) return;
    const status = useJarvisStore.getState().status;
    const t = clock.elapsedTime;
    const level = status === "speaking" ? readTtsLevel(freqBuf) : 0;
    const speed = status === "processing" ? 0.5 : status === "listening" ? 0.25 : 0.1;

    if (style === "reactor") {
      // Face caméra : rotation dans le plan écran uniquement
      points.current.rotation.z = t * speed * 1.6;
      points.current.rotation.x = 0;
      points.current.rotation.y = 0;
    } else if (style === "galaxy") {
      points.current.rotation.y = t * speed * 1.8;
      points.current.rotation.x = 0.5;                 // vue inclinée
    } else {
      points.current.rotation.y = t * speed;
      points.current.rotation.x = Math.sin(t * 0.08) * 0.15;
    }

    const breath = 1 + Math.sin(t * 1.4) * 0.02 + level * 0.35;
    points.current.scale.setScalar(breath);

    color.current.lerp(new THREE.Color(statusColor(status)), 0.06);
    material.current.color.copy(color.current);
    material.current.opacity = status === "standby" ? 0.45 : 0.9 + level * 0.1;
  });

  return (
    <points ref={points}>
      <bufferGeometry key={style}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={material}
        size={0.022}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function OrbitalRing({ radius, tilt, speed }: { radius: number; tilt: number; speed: number }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const color = useRef(new THREE.Color(statusColor("idle")));

  useFrame(({ clock }) => {
    if (!group.current || !material.current) return;
    const status = useJarvisStore.getState().status;
    group.current.rotation.z = clock.elapsedTime * speed;
    color.current.lerp(new THREE.Color(statusColor(status)), 0.06);
    material.current.color.copy(color.current);
  });

  return (
    <group rotation={[tilt, 0, 0]}>
      <group ref={group}>
        <mesh>
          <torusGeometry args={[radius, 0.006, 8, 128]} />
          <meshBasicMaterial
            ref={material}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Traceur lumineux sur l'anneau */}
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function CoreGlow({ intense }: { intense?: boolean }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useMemo(() => new Uint8Array(256), []);
  const color = useRef(new THREE.Color(statusColor("idle")));

  useFrame(({ clock }) => {
    if (!material.current) return;
    const status = useJarvisStore.getState().status;
    const level = status === "speaking" ? readTtsLevel(freqBuf) : 0;
    color.current.lerp(new THREE.Color(statusColor(status)), 0.06);
    material.current.color.copy(color.current);
    const base = intense ? 0.3 : 0.12;
    material.current.opacity = base + Math.sin(clock.elapsedTime * 2) * 0.05 + level * 0.3;
  });

  return (
    <mesh>
      <sphereGeometry args={[intense ? 0.45 : 0.65, 32, 32]} />
      <meshBasicMaterial
        ref={material}
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Hologramme 3D animé — style et couleur pilotés par le thème du store.
 *  Remplit son conteneur parent (position: relative requis). */
export function JarvisScene() {
  const holoStyle = useJarvisStore((s) => s.holoStyle);
  // Re-render à chaque changement de thème (couleur lue dans useFrame)
  useJarvisStore((s) => s.theme);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5.0], fov: 48 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
      >
        <ParticleCloud key={holoStyle} style={holoStyle} />
        {holoStyle === "sphere" && (
          <>
            <OrbitalRing radius={2.05} tilt={Math.PI / 2.6} speed={0.3} />
            <OrbitalRing radius={2.35} tilt={-Math.PI / 3.2} speed={-0.18} />
            <OrbitalRing radius={2.7} tilt={Math.PI / 5} speed={0.1} />
            <CoreGlow />
          </>
        )}
        {holoStyle === "reactor" && (
          <>
            <OrbitalRing radius={2.45} tilt={0} speed={-0.35} />
            <CoreGlow intense />
          </>
        )}
        {holoStyle === "galaxy" && <CoreGlow intense />}
      </Canvas>
    </div>
  );
}
