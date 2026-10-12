"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { LabelProjector, labelRegistry } from "./labels";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Agent } from "@/lib/types";
import { matchesFilters, hasActiveFilters } from "@/lib/filter";
import { buildCharacterGeometry, lookFor } from "./characterGeometry";
import { moveWithCollision, standPoint, WALL_H, type OfficeLayout, type Seat } from "./layout";
import { useOffice } from "./store";

const vertexMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const dimMaterial = new THREE.MeshStandardMaterial({
  color: "#9CA3AF",
  flatShading: true,
  roughness: 1,
  transparent: true,
  opacity: 0.35,
});

export function OfficeScene({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  return (
    <>
      <color attach="background" args={["#E7EEF6"]} />
      <fog attach="fog" args={["#E7EEF6", 45, 120]} />
      <hemisphereLight args={["#FFFFFF", "#B8C4D6", 1.1]} />
      <directionalLight position={[30, 50, 20]} intensity={1.6} />
      <directionalLight position={[-20, 30, -30]} intensity={0.4} />

      <Ground layout={layout} />
      <Rooms layout={layout} />
      <Walls layout={layout} />
      <Desks agents={agents} layout={layout} />
      <BlobShadows layout={layout} />
      <MeetingFurniture layout={layout} />
      <Characters agents={agents} layout={layout} />
      <LabelProjector />
      <Player agents={agents} layout={layout} />
    </>
  );
}

/* ----------------------------------------------------------------- lantai */

function Ground({ layout }: { layout: OfficeLayout }) {
  const walkTo = useOffice((s) => s.walkTo);
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const w = maxX - minX + 40;
  const d = maxZ - minZ + 40;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Abaikan klik yang sebenarnya akhir dari drag kamera.
    if (e.delta > 4) return;
    e.stopPropagation();
    walkTo({ x: e.point.x, z: e.point.z });
  };
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(minX + maxX) / 2, 0, (minZ + maxZ) / 2]} onClick={onClick}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#D9DEE5" roughness={1} />
    </mesh>
  );
}

function Rooms({ layout }: { layout: OfficeLayout }) {
  const walkTo = useOffice((s) => s.walkTo);
  return (
    <group>
      {layout.rooms.map((room) => {
        const tint = new THREE.Color(room.color).lerp(new THREE.Color("#FFFFFF"), 0.82);
        return (
          <mesh
            key={room.id}
            rotation-x={-Math.PI / 2}
            position={[room.x + room.w / 2, 0.01, room.z + room.d / 2]}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              walkTo({ x: e.point.x, z: e.point.z });
            }}
          >
            <planeGeometry args={[room.w, room.d]} />
            <meshStandardMaterial color={tint} roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function Walls({ layout }: { layout: OfficeLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const walls = layout.walls.filter((w) => w.w > 0.01 && w.d > 0.01);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    walls.forEach((w, i) => {
      m.compose(
        new THREE.Vector3(w.x + w.w / 2, WALL_H / 2, w.z + w.d / 2),
        new THREE.Quaternion(),
        new THREE.Vector3(w.w, WALL_H, w.d),
      );
      ref.current!.setMatrixAt(i, m);
      m.compose(
        new THREE.Vector3(w.x + w.w / 2, WALL_H + 0.05, w.z + w.d / 2),
        new THREE.Quaternion(),
        new THREE.Vector3(w.w + 0.02, 0.1, w.d + 0.02),
      );
      capRef.current!.setMatrixAt(i, m);
      capRef.current!.setColorAt(i, c.set(w.color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    capRef.current!.instanceMatrix.needsUpdate = true;
    if (capRef.current!.instanceColor) capRef.current!.instanceColor.needsUpdate = true;
  }, [walls]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, walls.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#F8FAFC" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[undefined, undefined, walls.length]}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------- meja */

type InstPart = { size: [number, number, number]; offset: [number, number, number]; color?: string; basic?: boolean };

const DESK_PARTS: InstPart[] = [
  { size: [1.5, 0.06, 0.7], offset: [0, 0.76, 0.72], color: "#C8A27A" },
  { size: [0.06, 0.73, 0.62], offset: [-0.7, 0.365, 0.72], color: "#8B6B4A" },
  { size: [0.06, 0.73, 0.62], offset: [0.7, 0.365, 0.72], color: "#8B6B4A" },
  { size: [0.62, 0.38, 0.04], offset: [0, 1.06, 0.95], color: "#1F2937" },
  { size: [0.06, 0.12, 0.06], offset: [0, 0.83, 0.97], color: "#1F2937" },
  { size: [0.46, 0.02, 0.16], offset: [0, 0.8, 0.55], color: "#E5E7EB" },
  { size: [0.08, 0.1, 0.08], offset: [0.48, 0.84, 0.6], color: "#F97316" }, // cangkir kopi
];

function Desks({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  const seats = agents.map((a) => layout.seats.get(a.id)).filter(Boolean) as Seat[];
  return (
    <group>
      {DESK_PARTS.map((p, i) => (
        <InstancedBoxes key={i} seats={seats} part={p} />
      ))}
      <Screens agents={agents} layout={layout} />
    </group>
  );
}

function InstancedBoxes({ seats, part }: { seats: Seat[]; part: InstPart }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    seats.forEach((s, i) => {
      m.compose(
        new THREE.Vector3(s.x + part.offset[0], part.offset[1], s.z + part.offset[2]),
        new THREE.Quaternion(),
        new THREE.Vector3(...part.size),
      );
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [seats, part]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, seats.length]}>
      <boxGeometry />
      <meshStandardMaterial color={part.color} flatShading roughness={0.8} />
    </instancedMesh>
  );
}

/** Layar monitor menyala dengan warna agen (menghadap si agen). */
function Screens({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    agents.forEach((a, i) => {
      const s = layout.seats.get(a.id)!;
      m.compose(new THREE.Vector3(s.x, 1.06, s.z + 0.925), new THREE.Quaternion(), new THREE.Vector3(0.56, 0.32, 0.01));
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, c.set(a.color).lerp(new THREE.Color("#FFFFFF"), 0.35));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [agents, layout]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, agents.length]}>
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function BlobShadows({ layout }: { layout: OfficeLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seats = useMemo(() => [...layout.seats.values()], [layout]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    seats.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0.015, s.z + 0.35), q, new THREE.Vector3(1.9, 1.5, 1));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [seats]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, seats.length]}>
      <circleGeometry args={[0.5, 16]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.12} depthWrite={false} />
    </instancedMesh>
  );
}

function MeetingFurniture({ layout }: { layout: OfficeLayout }) {
  const r = layout.meetingRoom;
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2 + 0.5;
  const chairs = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, 0.76, 0]}>
        <cylinderGeometry args={[3.2, 3.2, 0.1, 24]} />
        <meshStandardMaterial color="#B7865B" flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.5, 0.8, 0.76, 8]} />
        <meshStandardMaterial color="#6B4F36" flatShading />
      </mesh>
      {chairs.map((a, i) => (
        <group key={i} position={[Math.sin(a) * 4, 0, Math.cos(a) * 4]} rotation-y={a + Math.PI}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.62, 0.1, 0.58]} />
            <meshStandardMaterial color="#374151" flatShading />
          </mesh>
          <mesh position={[0, 0.9, -0.26]}>
            <boxGeometry args={[0.62, 0.7, 0.08]} />
            <meshStandardMaterial color="#374151" flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.2, r.d / 2 - 0.9]}>
        <boxGeometry args={[5, 1.4, 0.1]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ tokoh */

function Characters({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  const filters = useOffice((s) => s.filters);
  const active = hasActiveFilters(filters);
  return (
    <group>
      {agents.map((a) => (
        <AgentCharacter
          key={a.id}
          agent={a}
          seat={layout.seats.get(a.id)!}
          dimmed={active && !matchesFilters(a, filters)}
          layout={layout}
        />
      ))}
    </group>
  );
}

function AgentCharacter({ agent, seat, dimmed, layout }: { agent: Agent; seat: Seat; dimmed: boolean; layout: OfficeLayout }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => buildCharacterGeometry(lookFor(agent.id, agent.division, agent.color)), [agent]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const isSelected = useOffice((s) => s.selectedId === agent.id);
  const isHovered = useOffice((s) => s.hoveredId === agent.id);
  const { hover, select, walkTo } = useOffice.getState();
  const phase = useMemo(() => (agent.id.length * 7.13) % (Math.PI * 2), [agent.id]);

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime + phase;
    // Bernapas/mengetik pelan; melompat kecil saat dipilih.
    m.position.y = isSelected ? Math.abs(Math.sin(t * 4)) * 0.12 : Math.sin(t * 2.2) * 0.012;
    const targetScale = isHovered || isSelected ? 1.06 : 1;
    m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, targetScale, 0.2));
  });

  return (
    <group position={[seat.x, 0, seat.z]}>
      <mesh
        ref={ref}
        geometry={geometry}
        material={dimmed ? dimMaterial : vertexMaterial}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(agent.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          if (useOffice.getState().hoveredId === agent.id) hover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          select(agent.id);
          walkTo(standPoint(layout.seats.get(agent.id)!));
        }}
      />
      {(isSelected || isHovered) && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0.2]}>
          <ringGeometry args={[0.55, 0.72, 32]} />
          <meshBasicMaterial color={isSelected ? "#F59E0B" : "#FFFFFF"} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

/* ----------------------------------------------------------------- pemain */

const PLAYER_SPEED = 6.5;

function Player({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  const group = useRef<THREE.Group>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const keys = useRef(new Set<string>());
  const pos = useRef({ ...layout.spawn });
  const facing = useRef(Math.PI); // menghadap utara (ke kantor)
  const lastNearbyCheck = useRef(0);
  const lastPublish = useRef(0);
  const stuckTime = useRef(0);
  const camera = useThree((st) => st.camera);

  const geometry = useMemo(
    () =>
      buildCharacterGeometry(
        { skin: "#E8B48F", hair: "#1F1A17", hairStyle: 0, bodyWidth: 1, height: 1, accessory: "none", pants: "#1E3A8A", shirt: "#F59E0B" },
        false,
      ),
    [],
  );

  useEffect(() => {
    camera.position.set(pos.current.x, 15, pos.current.z + 13);
    controls.current?.target.set(pos.current.x, 1, pos.current.z);
    controls.current?.update();
  }, [camera]);

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        keys.current.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
        useOffice.getState().walkTo(null);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useFrame(({ clock, camera: cam }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = useOffice.getState();
    const prev = { ...pos.current };

    if (state.teleport) {
      pos.current = moveWithCollision(layout, state.teleport, 0, 0);
      state.consumeTeleport();
    }

    // Arah maju mengikuti azimut kamera.
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const k = keys.current;
    const move = new THREE.Vector3();
    if (k.has("w") || k.has("arrowup")) move.add(fwd);
    if (k.has("s") || k.has("arrowdown")) move.sub(fwd);
    if (k.has("d") || k.has("arrowright")) move.add(right);
    if (k.has("a") || k.has("arrowleft")) move.sub(right);

    let moving = false;
    const speed = PLAYER_SPEED * (k.has("shift") ? 1.8 : 1);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      pos.current = moveWithCollision(layout, pos.current, move.x, move.z);
      moving = true;
    } else if (state.walkTarget) {
      const dx = state.walkTarget.x - pos.current.x;
      const dz = state.walkTarget.z - pos.current.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.12) {
        state.walkTo(null);
        // Sampai di depan agen terpilih: hadapkan ke agen.
        if (state.selectedId) facing.current = Math.PI;
      } else {
        const step = Math.min(dist, speed * 1.3 * dt);
        const next = moveWithCollision(layout, pos.current, (dx / dist) * step, (dz / dist) * step);
        const progressed = Math.hypot(next.x - pos.current.x, next.z - pos.current.z);
        stuckTime.current = progressed < step * 0.2 ? stuckTime.current + dt : 0;
        pos.current = next;
        moving = true;
        // Terhalang dinding terlalu lama: pindah langsung (teleport halus) agar tidak frustrasi.
        if (stuckTime.current > 0.6) {
          pos.current = moveWithCollision(layout, state.walkTarget, 0, 0);
          state.walkTo(null);
          stuckTime.current = 0;
        }
      }
    }

    const ddx = pos.current.x - prev.x;
    const ddz = pos.current.z - prev.z;
    if (moving && (Math.abs(ddx) > 1e-4 || Math.abs(ddz) > 1e-4)) facing.current = Math.atan2(ddx, ddz);

    // Kamera ikut bergeser bersama pemain.
    cam.position.x += ddx;
    cam.position.z += ddz;
    if (controls.current) {
      controls.current.target.x += ddx;
      controls.current.target.z += ddz;
      controls.current.update();
    }

    const g = group.current;
    if (g) {
      g.position.set(pos.current.x, moving ? Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.06 : 0, pos.current.z);
      const cur = g.rotation.y;
      let diff = facing.current - cur;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y = cur + diff * Math.min(1, dt * 12);
    }

    labelRegistry.get("__player")?.pos.set(pos.current.x, 2.1, pos.current.z);

    const now = clock.elapsedTime;
    if (now - lastPublish.current > 0.15) {
      lastPublish.current = now;
      state.setPlayerPos({ ...pos.current });
    }
    if (now - lastNearbyCheck.current > 0.3) {
      lastNearbyCheck.current = now;
      const near: string[] = [];
      for (const a of agents) {
        const s = layout.seats.get(a.id)!;
        if ((s.x - pos.current.x) ** 2 + (s.z - pos.current.z) ** 2 < 36) near.push(a.id);
      }
      const prevIds = state.nearbyIds;
      if (near.length !== prevIds.length || near.some((id, i) => id !== prevIds[i])) state.setNearby(near);
    }
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={5}
        maxDistance={60}
        maxPolarAngle={Math.PI * 0.42}
        minPolarAngle={0.25}
        enableDamping
        dampingFactor={0.12}
      />
      <group ref={group}>
        <mesh geometry={geometry} material={vertexMaterial} />
      </group>
    </>
  );
}
