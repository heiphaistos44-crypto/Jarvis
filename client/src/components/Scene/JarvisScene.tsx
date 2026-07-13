import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useJarvisStore, getTtsAnalyser } from "../../stores/jarvisStore";
import type { JarvisStatus } from "../../types";

const STATUS_COLORS: Record<JarvisStatus, string> = {
  idle: "#00d4ff",
  standby: "#3355aa",
  listening: "#00ff88",
  processing: "#ffaa00",
  speaking: "#8866ff",
  error: "#ff3333",
};

const PARTICLE_COUNT = 6000;

/** Niveau audio TTS [0,1] — 0 si pas d'analyseur ou silence. */
function readTtsLevel(buf: Uint8Array): number {
  const analyser = getTtsAnalyser();
  if (!analyser) return 0;
  analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / (buf.length * 255);
}

function ParticleSphere() {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const freqBuf = useMemo(() => new Uint8Array(256), []);
  const color = useRef(new THREE.Color(STATUS_COLORS.idle));

  const positions = useMemo(() => {
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
  }, []);

  useFrame(({ clock }) => {
    if (!points.current || !material.current) return;
    const status = useJarvisStore.getState().status;
    const t = clock.elapsedTime;
    const level = status === "speaking" ? readTtsLevel(freqBuf) : 0;

    const speed = status === "processing" ? 0.5 : status === "listening" ? 0.25 : 0.1;
    points.current.rotation.y = t * speed;
    points.current.rotation.x = Math.sin(t * 0.08) * 0.15;

    // Respiration + réaction audio
    const breath = 1 + Math.sin(t * 1.4) * 0.02 + level * 0.35;
    points.current.scale.setScalar(breath);

    color.current.lerp(new THREE.Color(STATUS_COLORS[status]), 0.06);
    material.current.color.copy(color.current);
    material.current.opacity = status === "standby" ? 0.45 : 0.9 + level * 0.1;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
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
  const color = useRef(new THREE.Color(STATUS_COLORS.idle));

  useFrame(({ clock }) => {
    if (!group.current || !material.current) return;
    const status = useJarvisStore.getState().status;
    group.current.rotation.z = clock.elapsedTime * speed;
    color.current.lerp(new THREE.Color(STATUS_COLORS[status]), 0.06);
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

function CoreGlow() {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const freqBuf = useMemo(() => new Uint8Array(256), []);
  const color = useRef(new THREE.Color(STATUS_COLORS.idle));

  useFrame(({ clock }) => {
    if (!material.current) return;
    const status = useJarvisStore.getState().status;
    const level = status === "speaking" ? readTtsLevel(freqBuf) : 0;
    color.current.lerp(new THREE.Color(STATUS_COLORS[status]), 0.06);
    material.current.color.copy(color.current);
    material.current.opacity =
      0.12 + Math.sin(clock.elapsedTime * 2) * 0.04 + level * 0.3;
  });

  return (
    <mesh>
      <sphereGeometry args={[0.65, 32, 32]} />
      <meshBasicMaterial
        ref={material}
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Hologramme 3D animé — sphère de particules + anneaux orbitaux,
 *  audio-réactif sur le TTS, couleur pilotée par le statut JARVIS.
 *  Remplit son conteneur parent (position: relative requis). */
export function JarvisScene() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5.0], fov: 48 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
      >
        <ParticleSphere />
        <OrbitalRing radius={2.05} tilt={Math.PI / 2.6} speed={0.3} />
        <OrbitalRing radius={2.35} tilt={-Math.PI / 3.2} speed={-0.18} />
        <OrbitalRing radius={2.7} tilt={Math.PI / 5} speed={0.1} />
        <CoreGlow />
      </Canvas>
    </div>
  );
}
