"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Agent } from "@/lib/types";
import { hasActiveFilters, matchesFilters } from "@/lib/filter";
import { deskFront, findPath, floorY, seatExit, type Building, type FloorId, type Waypoint } from "./building";
import { lookFor, seatedStaticGeometry } from "./character";
import { labelRegistry } from "./labels";
import { materials } from "./materials";
import { Rig, type RigMode } from "./Rig";
import { useOffice } from "./store";

/* ------------------------------------------------- tokoh duduk di meja */

const geoCache = new Map<string, THREE.BufferGeometry>();
function seatedGeo(a: Agent) {
  let g = geoCache.get(a.id);
  if (!g) {
    g = seatedStaticGeometry(lookFor(a.id, a.division, a.color));
    geoCache.set(a.id, g);
  }
  return g;
}

const dimMaterial = new THREE.MeshStandardMaterial({ color: "#A8AFBA", roughness: 1, transparent: true, opacity: 0.4 });

export function SeatedAgents({ agents, b, floor }: { agents: Agent[]; b: Building; floor: FloorId }) {
  const filters = useOffice((s) => s.filters);
  const away = useOffice((s) => s.awayIds);
  const active = hasActiveFilters(filters);
  const onFloor = useMemo(() => agents.filter((a) => b.seats.get(a.id)?.floor === floor), [agents, b, floor]);
  return (
    <group>
      {onFloor
        .filter((a) => !away.has(a.id))
        .map((a) => (
          <SeatedAgent key={a.id} agent={a} b={b} dimmed={active && !matchesFilters(a, filters)} />
        ))}
    </group>
  );
}

function SeatedAgent({ agent, b, dimmed }: { agent: Agent; b: Building; dimmed: boolean }) {
  const seat = b.seats.get(agent.id)!;
  const ref = useRef<THREE.Mesh>(null);
  const isSelected = useOffice((s) => s.selectedId === agent.id);
  const isHovered = useOffice((s) => s.hoveredId === agent.id);
  const phase = useMemo(() => (agent.id.length * 1.37) % 6.28, [agent.id]);
  const y = floorY(seat.floor);

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime + phase;
    m.position.y = y + (isSelected ? Math.abs(Math.sin(t * 4)) * 0.1 : Math.sin(t * 2) * 0.008);
    m.rotation.y = isSelected ? Math.sin(t * 2) * 0.15 : Math.sin(t * 0.5) * 0.06;
  });

  return (
    <group>
      <mesh
        ref={ref}
        geometry={seatedGeo(agent)}
        material={dimmed ? dimMaterial : materials().character}
        position={[seat.x, y, seat.z]}
        castShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          useOffice.getState().hover(agent.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          if (useOffice.getState().hoveredId === agent.id) useOffice.getState().hover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          const st = useOffice.getState();
          st.select(agent.id);
          st.walkTo({ ...deskFront(seat), floor: seat.floor });
        }}
      />
      {(isSelected || isHovered) && (
        <mesh rotation-x={-Math.PI / 2} position={[seat.x, y + 0.03, seat.z]}>
          <ringGeometry args={[0.5, 0.66, 40]} />
          <meshBasicMaterial color={isSelected ? "#F59E0B" : "#FFFFFF"} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ---------------------------------------------- sutradara rapat & pejalan */

type Walker = {
  id: string;
  path: Waypoint[];
  seg: number;
  t: number;
  pos: THREE.Vector3;
  floor: FloorId;
  rotY: number;
  mode: RigMode;
  phase: "toMeeting" | "seated" | "returning";
  /** m/detik; jalur jauh ditempuh lebih cepat (berlari) agar tiba sebelum rapat dimulai. */
  speed: number;
  chair: { x: number; z: number; rotY: number };
};

const WALK = 2.3;
const ARRIVE_IN = 11; // detik: target tiba di ruang rapat (server menunggu ~14 detik)

function pathLength(p: Waypoint[]) {
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z, p[i].y - p[i - 1].y);
  return len;
}

function setPath(w: Walker, path: Waypoint[], phase: Walker["phase"]) {
  w.path = path;
  w.seg = 0;
  w.t = 0;
  w.phase = phase;
  w.speed = Math.min(8, Math.max(WALK, pathLength(path) / (phase === "toMeeting" ? ARRIVE_IN : ARRIVE_IN * 1.5)));
  w.mode = w.speed > 3.6 ? "run" : "walk";
}

/** Data pejalan disimpan di luar React: dimutasi tiap frame tanpa memicu render. */
const walkerStore = new Map<string, Walker>();

export function MeetingDirector({ agents, b }: { agents: Agent[]; b: Building }) {
  const task = useOffice((s) => s.task);
  const [ids, setIds] = useState<string[]>([]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const attending = useMemo(
    () => (task && ["gathering", "meeting"].includes(task.status) ? task.participants.filter((id) => b.seats.has(id)) : []),
    [task, b],
  );
  const status = task?.status;

  const syncIds = useCallback(() => {
    const list = [...walkerStore.keys()];
    setIds(list);
    useOffice.getState().setAway(new Set(list));
  }, []);

  const finish = useCallback(
    (id: string) => {
      walkerStore.delete(id);
      // Kembalikan label ke atas meja agar tidak tertinggal di posisi terakhir berjalan.
      const entry = labelRegistry.get(id);
      const seat = b.seats.get(id);
      if (entry && seat) {
        entry.pos.set(seat.x, floorY(seat.floor) + 1.95, seat.z);
        entry.floorRef.floor = seat.floor;
      }
      syncIds();
    },
    [b, syncIds],
  );

  useEffect(() => {
    const att = new Set(attending);
    // Peserta baru: berangkat dari meja (atau langsung duduk bila rapat sudah berjalan saat halaman dibuka).
    attending.forEach((id, i) => {
      const existing = walkerStore.get(id);
      const chair = b.meeting.chairs[i % b.meeting.chairs.length];
      if (existing) {
        if (existing.phase === "returning") {
          existing.chair = chair;
          setPath(existing, findPath(b, { x: existing.pos.x, z: existing.pos.z, floor: existing.floor }, { ...chair, floor: 0 }), "toMeeting");
        }
        return;
      }
      const seat = b.seats.get(id)!;
      const start = seatExit(seat);
      const w: Walker = {
        id,
        path: [],
        seg: 0,
        t: 0,
        pos: new THREE.Vector3(start.x, floorY(seat.floor), start.z),
        floor: seat.floor,
        rotY: Math.PI,
        mode: "walk",
        phase: "toMeeting",
        speed: WALK,
        chair,
      };
      setPath(w, findPath(b, { ...start, floor: seat.floor }, { x: chair.x, z: chair.z, floor: 0 }), "toMeeting");
      if (status === "meeting") sitAtChair(w);
      walkerStore.set(id, w);
    });
    // Yang sudah tidak diundang / rapat selesai: pulang ke meja.
    for (const w of walkerStore.values()) {
      if (att.has(w.id) || w.phase === "returning") continue;
      const seat = b.seats.get(w.id)!;
      setPath(w, findPath(b, { x: w.pos.x, z: w.pos.z, floor: w.floor }, { ...seatExit(seat), floor: seat.floor }), "returning");
    }
    // Ditunda satu tick agar setState tidak terjadi sinkron di dalam effect.
    const t = setTimeout(syncIds, 0);
    return () => clearTimeout(t);
  }, [attending, status, b, syncIds]);

  return (
    <group>
      {ids.map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        return <WalkerView key={id} agent={a} onDone={finish} />;
      })}
    </group>
  );
}

function sitAtChair(w: Walker) {
  w.pos.set(w.chair.x, 0, w.chair.z);
  w.floor = 0;
  w.rotY = w.chair.rotY;
  w.mode = "sit";
  w.phase = "seated";
  w.path = [];
}

function WalkerView({ agent, onDone }: { agent: Agent; onDone: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const look = useMemo(() => lookFor(agent.id, agent.division, agent.color), [agent]);
  const [mode, setMode] = useState<RigMode>(() => walkerStore.get(agent.id)?.mode ?? "walk");
  const talking = useOffice((s) => s.speakingId === agent.id);
  const doneRef = useRef(false);

  useFrame((_, rawDt) => {
    // Waktu nyata (bukan dibatasi kecil) agar tetap tiba tepat waktu walau FPS rendah.
    const dt = Math.min(rawDt, 0.5);
    const w = walkerStore.get(agent.id);
    if (!w) return;
    if (w.phase !== "seated" && w.path.length > 1) {
      let remaining = w.speed * dt;
      while (remaining > 0 && w.seg < w.path.length - 1) {
        const a = w.path[w.seg];
        const c = w.path[w.seg + 1];
        const len = Math.hypot(c.x - a.x, c.z - a.z) || 0.0001;
        const left = (1 - w.t) * len;
        if (remaining >= left) {
          remaining -= left;
          w.seg++;
          w.t = 0;
        } else {
          w.t += remaining / len;
          remaining = 0;
        }
      }
      const a = w.path[Math.min(w.seg, w.path.length - 1)];
      const c = w.path[Math.min(w.seg + 1, w.path.length - 1)];
      const nx = a.x + (c.x - a.x) * w.t;
      const nz = a.z + (c.z - a.z) * w.t;
      const ny = a.y + (c.y - a.y) * w.t;
      const dx = nx - w.pos.x;
      const dz = nz - w.pos.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-5) {
        const target = Math.atan2(dx, dz);
        let diff = target - w.rotY;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        w.rotY += diff * Math.min(1, dt * 10);
      }
      w.pos.set(nx, ny, nz);
      w.floor = ny > 2.3 ? 1 : 0;
      if (w.seg >= w.path.length - 1) {
        if (w.phase === "toMeeting") {
          sitAtChair(w);
          setMode("sit");
        } else if (!doneRef.current) {
          doneRef.current = true;
          onDone(agent.id);
        }
      } else if (mode !== w.mode) setMode(w.mode);
    } else if (w.phase === "seated" && mode !== "sit") {
      setMode("sit");
    } else if (w.phase !== "seated" && w.path.length <= 1 && !doneRef.current) {
      if (w.phase === "toMeeting") {
        sitAtChair(w);
        setMode("sit");
      } else {
        doneRef.current = true;
        onDone(agent.id);
      }
    }

    const g = group.current;
    if (g) {
      g.position.copy(w.pos);
      g.rotation.y = w.rotY;
      g.visible = w.floor === useOffice.getState().viewFloor;
    }
    const entry = labelRegistry.get(agent.id);
    if (entry) {
      entry.pos.set(w.pos.x, w.pos.y + (w.mode === "sit" ? 1.75 : 2.15), w.pos.z);
      entry.floorRef.floor = w.floor;
    }
  });

  return (
    <group ref={group}>
      <Rig look={look} mode={mode} talking={talking} phase={agent.id.length} />
    </group>
  );
}
