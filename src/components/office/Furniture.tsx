"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Agent } from "@/lib/types";
import { floorY, ROOM_WALL_H, type Building, type FloorId, type Room } from "./building";
import { Boxes, type Box } from "./BuildingMesh";
import { boxGeo, chairGeometry, cylGeo, makePart, mergeParts, RECEPTIONIST_LOOK, sphereGeo } from "./character";
import { BRAND, logoTexture, materials, screenTexture, textTexture } from "./materials";
import { Rig } from "./Rig";
import { useOffice, type TaskDetail } from "./store";

const furnitureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

/* ------------------------------------------------------------------- meja */

export function Desks({ b, agents, floor }: { b: Building; agents: Agent[]; floor: FloorId }) {
  const M = materials();
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const desks = b.desks.filter((d) => d.floor === floor);
  const y = floorY(floor);
  const sets = useMemo(() => {
    const top: Box[] = [];
    const legs: Box[] = [];
    const dark: Box[] = [];
    const light: Box[] = [];
    const metal: Box[] = [];
    desks.forEach((d, i) => {
      const z = d.z + 0.72;
      top.push({ x: d.x, y: y + 0.75, z, sx: 1.5, sy: 0.05, sz: 0.72 });
      legs.push({ x: d.x - 0.7, y: y + 0.37, z, sx: 0.05, sy: 0.73, sz: 0.66 });
      legs.push({ x: d.x + 0.7, y: y + 0.37, z, sx: 0.05, sy: 0.73, sz: 0.66 });
      legs.push({ x: d.x, y: y + 0.5, z: z + 0.33, sx: 1.36, sy: 0.4, sz: 0.03 });
      dark.push({ x: d.x, y: y + 1.12, z: z + 0.22, sx: 0.66, sy: 0.4, sz: 0.035 }); // monitor
      metal.push({ x: d.x, y: y + 0.86, z: z + 0.25, sx: 0.05, sy: 0.18, sz: 0.05 });
      metal.push({ x: d.x, y: y + 0.785, z: z + 0.22, sx: 0.24, sy: 0.015, sz: 0.16 });
      light.push({ x: d.x - 0.05, y: y + 0.785, z: z - 0.12, sx: 0.44, sy: 0.02, sz: 0.14 }); // keyboard
      light.push({ x: d.x + 0.3, y: y + 0.785, z: z - 0.1, sx: 0.06, sy: 0.02, sz: 0.1 }); // mouse
      if (i % 2 === 0) dark.push({ x: d.x + 0.58, y: y + 0.83, z: z + 0.05, sx: 0.08, sy: 0.1, sz: 0.08 }); // cangkir
    });
    return { top, legs, dark, light, metal };
  }, [desks, y]);

  return (
    <group>
      <Boxes items={sets.top} material={M.deskWood} castShadow />
      <Boxes items={sets.legs} material={M.deskLeg} castShadow />
      <Boxes items={sets.dark} material={M.darkPlastic} castShadow />
      <Boxes items={sets.light} material={M.lightPlastic} />
      <Boxes items={sets.metal} material={M.metal} />
      <Screens desks={desks} byId={byId} y={y} />
    </group>
  );
}

/** Layar monitor menyala menghadap agen; warna sesuai agen. */
function Screens({ desks, byId, y }: { desks: Building["desks"]; byId: Map<string, Agent>; y: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: screenTexture("#FFFFFF", 0), toneMapped: false }), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const c = new THREE.Color();
    desks.forEach((d, i) => {
      m.compose(new THREE.Vector3(d.x, y + 1.12, d.z + 0.72 + 0.2), q, new THREE.Vector3(0.6, 0.34, 1));
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, c.set(byId.get(d.agentId)?.color ?? "#60A5FA").lerp(new THREE.Color("#FFFFFF"), 0.25));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [desks, byId, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, mat, desks.length]}>
      <planeGeometry />
    </instancedMesh>
  );
}

/* --------------------------------------------------------------- dekorasi */

function plantGeometry(scale = 1) {
  return mergeParts([
    makePart(cylGeo(0.22 * scale, 0.17 * scale, 0.45 * scale), "#E9E4DA", [0, 0.225 * scale, 0]),
    makePart(cylGeo(0.2 * scale, 0.2 * scale, 0.04 * scale), "#4B3A2A", [0, 0.44 * scale, 0]),
    makePart(sphereGeo(0.38 * scale, 10, 8), "#3E8A47", [0, 0.9 * scale, 0], undefined, [1, 1.25, 1]),
    makePart(sphereGeo(0.28 * scale, 10, 8), "#4FA058", [0.18 * scale, 1.25 * scale, 0.05], undefined, [1, 1.2, 1]),
    makePart(sphereGeo(0.25 * scale, 10, 8), "#2F7A3C", [-0.17 * scale, 1.15 * scale, -0.08]),
  ]);
}

function sofaGeometry(color: string, w = 2.0) {
  const dark = "#" + new THREE.Color(color).multiplyScalar(0.8).getHexString();
  return mergeParts([
    makePart(boxGeo(w, 0.42, 0.85), color, [0, 0.25, 0]),
    makePart(boxGeo(w, 0.55, 0.22), dark, [0, 0.62, -0.32]),
    makePart(boxGeo(0.2, 0.62, 0.85), dark, [-w / 2 + 0.1, 0.36, 0]),
    makePart(boxGeo(0.2, 0.62, 0.85), dark, [w / 2 - 0.1, 0.36, 0]),
    ...[-1, 1].map((s) => makePart(boxGeo(w / 2 - 0.25, 0.12, 0.62), "#" + new THREE.Color(color).multiplyScalar(1.08).getHexString(), [(s * w) / 4.4, 0.51, 0.06])),
  ]);
}

function shelfGeometry() {
  const parts = [makePart(boxGeo(1.6, 2.0, 0.4), "#B98E62", [0, 1.0, 0])];
  const colors = ["#B91C1C", "#1D4ED8", "#047857", "#CA8A04", "#6D28D9", "#0F766E"];
  for (let r = 0; r < 4; r++) {
    let x = -0.7;
    while (x < 0.65) {
      const w = 0.06 + ((x * 97 + r * 13) % 1 + 1) % 1 * 0.07;
      const h = 0.28 + (((x * 31 + r) % 1) + 1) % 1 * 0.12;
      parts.push(makePart(boxGeo(w, h, 0.28), colors[Math.abs(Math.round(x * 50 + r)) % colors.length], [x + w / 2, 0.12 + r * 0.48 + h / 2, 0.06]));
      x += w + 0.01;
    }
  }
  return mergeParts(parts);
}

const placed = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, key?: string | number) => (
  <mesh key={key} geometry={geo} material={furnitureMat} position={[x, y, z]} rotation-y={ry} castShadow receiveShadow />
);

function RoomDecor({ room }: { room: Room }) {
  const y = floorY(room.floor);
  const plant = useMemo(() => plantGeometry(1), []);
  const shelf = useMemo(() => shelfGeometry(), []);
  const ext = room.side === "north" ? room.z + 0.6 : room.z + room.d - 0.6;
  const inner = room.side === "north" ? room.z + room.d - 0.7 : room.z + 0.7;
  const items: React.ReactNode[] = [];
  items.push(placed(plant, room.x + 0.7, y, ext, 0, "p1"));
  items.push(placed(plant, room.x + room.w - 0.7, y, ext, 0, "p2"));
  if (room.kind === "division" && room.w > 9) {
    items.push(placed(shelf, room.x + room.w / 2 + 2, y, ext + (room.side === "north" ? 0.1 : -0.1), room.side === "north" ? 0 : Math.PI, "s"));
  }
  if (room.kind === "division") {
    // Papan tulis di sekat barat.
    items.push(
      <group key="wb" position={[room.x + 0.2, y + 1.5, (room.z + room.d / 2 + inner) / 2]} rotation-y={Math.PI / 2}>
        <mesh castShadow>
          <boxGeometry args={[1.8, 1.0, 0.04]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[1.6, 0.8]} />
          <meshBasicMaterial map={screenTexture(room.color, 2)} transparent opacity={0.35} />
        </mesh>
      </group>,
    );
  }
  return <group>{items}</group>;
}

/* ------------------------------------------------------------------ lobby */

function Lobby({ b }: { b: Building }) {
  const lobby = b.rooms.find((r) => r.id === "lobby")!;
  const { x, z } = b.taskDesk;
  const sofa = useMemo(() => sofaGeometry("#334155", 2.2), []);
  const plant = useMemo(() => plantGeometry(1.4), []);
  const counter = useMemo(
    () =>
      mergeParts([
        makePart(boxGeo(3.6, 1.05, 0.7), "#F5F1EA", [0, 0.525, 0]),
        makePart(boxGeo(3.8, 0.06, 0.85), "#C9A27A", [0, 1.08, 0.05]),
        makePart(boxGeo(0.7, 1.05, 1.5), "#F5F1EA", [-1.95, 0.525, -0.45]),
        makePart(boxGeo(0.7, 1.05, 1.5), "#F5F1EA", [1.95, 0.525, -0.45]),
        makePart(boxGeo(3.6, 0.08, 0.02), "#F59E0B", [0, 0.2, 0.36]),
      ]),
    [],
  );
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.y = clock.elapsedTime * 0.8;
      ring.current.position.y = 2.55 + Math.sin(clock.elapsedTime * 2) * 0.08;
    }
  });
  const openCompose = () => useOffice.getState().openPanel("compose");

  return (
    <group>
      {/* meja tugas (klik untuk membuka formulir tugas) */}
      <group
        position={[x, 0, z]}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          openCompose();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <mesh geometry={counter} material={furnitureMat} castShadow receiveShadow />
        <mesh position={[0, 0.62, 0.36]}>
          <planeGeometry args={[2.6, 0.5]} />
          <meshBasicMaterial map={textTexture("taskdesk", "📥  MEJA TUGAS", { bg: "#1F2937", fg: "#FBBF24", w: 1024, h: 196 })} toneMapped={false} />
        </mesh>
        <group position={[0, 0, -0.85]}>
          <mesh geometry={useMemo(() => chairGeometry("#0F766E"), [])} material={furnitureMat} castShadow />
          <Rig look={RECEPTIONIST_LOOK} mode="sit" />
        </group>
        <group ref={ring}>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.45, 0.04, 8, 32]} />
            <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.22]} />
            <meshStandardMaterial color="#FDE68A" emissive="#F59E0B" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
        </group>
        <pointLight position={[0, 2.4, 0.6]} intensity={6} distance={7} color="#FFD58A" />
      </group>

      {/* dinding logo di belakang resepsionis */}
      <group position={[x, 0, lobby.z + 1.2]}>
        <mesh position={[0, 1.4, 0]} castShadow>
          <boxGeometry args={[6, 2.8, 0.25]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
        </mesh>
        {/* list oranye & navy khas brand */}
        <mesh position={[0, 0.06, 0.13]}>
          <boxGeometry args={[6, 0.12, 0.02]} />
          <meshStandardMaterial color={BRAND.orange} />
        </mesh>
        <mesh position={[0, 2.74, 0.13]}>
          <boxGeometry args={[6, 0.12, 0.02]} />
          <meshStandardMaterial color={BRAND.navy} />
        </mesh>
        <mesh position={[0, 1.65, 0.131]}>
          <planeGeometry args={[4.4, 1.53]} />
          <meshBasicMaterial map={logoTexture()} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.55, 0.131]}>
          <planeGeometry args={[4, 0.35]} />
          <meshBasicMaterial map={textTexture("logo-sub", "282 spesialis AI · siap menerima tugas Anda", { bg: "#FFFFFF", fg: BRAND.navy, w: 1024, h: 90 })} toneMapped={false} />
        </mesh>
      </group>

      {/* ruang tunggu */}
      {placed(sofa, lobby.x + 2.2, 0, lobby.z + lobby.d - 3.2, Math.PI / 2, "s1")}
      {placed(sofa, lobby.x + lobby.w - 2.2, 0, lobby.z + lobby.d - 3.2, -Math.PI / 2, "s2")}
      <mesh position={[x, 0.01, lobby.z + lobby.d - 3.2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[6.5, 3.4]} />
        <meshStandardMaterial color="#B45309" roughness={1} />
      </mesh>
      <mesh position={[x, 0.22, lobby.z + lobby.d - 3.2]} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.06, 24]} />
        <meshStandardMaterial color="#E7E5E4" roughness={0.3} />
      </mesh>
      {placed(plant, lobby.x + 0.9, 0, lobby.z + 0.9, 0, "pl1")}
      {placed(plant, lobby.x + lobby.w - 0.9, 0, lobby.z + 0.9, 0, "pl2")}
    </group>
  );
}

/* ------------------------------------------------------------- ruang rapat */

function MeetingRoom({ b, agents }: { b: Building; agents: Agent[] }) {
  const { center, chairs, room } = b.meeting;
  const chair = useMemo(() => chairGeometry("#1E293B"), []);
  const plant = useMemo(() => plantGeometry(1.2), []);
  return (
    <group>
      <mesh position={[center.x, 0.74, center.z]} scale={[1.25, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.2, 0.08, 40]} />
        <meshStandardMaterial color="#8B5E3C" roughness={0.35} />
      </mesh>
      <mesh position={[center.x, 0.36, center.z]} castShadow>
        <cylinderGeometry args={[0.45, 0.7, 0.72, 16]} />
        <meshStandardMaterial color="#3F3F46" roughness={0.4} metalness={0.5} />
      </mesh>
      {chairs.map((c, i) => (
        <mesh key={i} geometry={chair} material={furnitureMat} position={[c.x, 0, c.z]} rotation-y={c.rotY} castShadow />
      ))}
      <MeetingScreen position={[room.x + 0.25, 1.75, center.z]} agents={agents} />
      {placed(plant, room.x + room.w - 0.8, 0, room.z + room.d - 0.8, 0, "mp1")}
      {placed(plant, room.x + room.w - 0.8, 0, room.z + 0.8, 0, "mp2")}
      <pointLight position={[center.x, 2.8, center.z]} intensity={5} distance={9} color="#FFF1D6" />
    </group>
  );
}

/** Layar TV ruang rapat: menampilkan tugas, status, dan siapa yang sedang bicara. */
function MeetingScreen({ position, agents }: { position: [number, number, number]; agents: Agent[] }) {
  const task = useOffice((s) => s.task);
  const speakingId = useOffice((s) => s.speakingId);
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 576;
    return c;
  }, []);
  const tex = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  const speaker = speakingId ? agents.find((x) => x.id === speakingId) : undefined;
  const speakerName = speaker ? `${speaker.emoji} ${speaker.name}` : null;
  useEffect(() => {
    if (canvas && tex) drawMeetingScreen(canvas, tex, task, speakerName);
  }, [task, speakerName, canvas, tex]);

  return (
    <group position={position} rotation-y={Math.PI / 2}>
      <mesh castShadow>
        <boxGeometry args={[3.4, 1.95, 0.08]} />
        <meshStandardMaterial color="#111827" roughness={0.3} />
      </mesh>
      {tex && (
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[3.25, 1.83]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function drawMeetingScreen(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, task: TaskDetail | null, speakerName: string | null) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0B1220";
    ctx.fillRect(0, 0, 1024, 576);
    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(0, 0, 1024, 70);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.fillText("RUANG RAPAT", 32, 48);
    ctx.fillStyle = "#E2E8F0";
    if (!task || ["approved", "rejected"].includes(task.status)) {
      ctx.font = "bold 46px system-ui, sans-serif";
      ctx.fillText("Tidak ada rapat berlangsung", 32, 200);
      ctx.font = "30px system-ui, sans-serif";
      ctx.fillStyle = "#94A3B8";
      ctx.fillText("Kirim tugas di Meja Tugas (lobby) untuk", 32, 270);
      ctx.fillText("memanggil para lead ke ruangan ini.", 32, 312);
    } else {
      const labels: Record<string, string> = {
        routing: "Memilih peserta…",
        gathering: "Para lead menuju ruang rapat",
        meeting: "Rapat berlangsung",
        review: "Menunggu review pemberi tugas",
        failed: "Rapat terhenti",
      };
      ctx.font = "bold 44px system-ui, sans-serif";
      wrap(ctx, task.title, 32, 150, 960, 52, 2);
      ctx.font = "bold 32px system-ui, sans-serif";
      ctx.fillStyle = "#FBBF24";
      ctx.fillText(`● ${labels[task.status] ?? task.status}${task.revision > 1 ? ` · revisi ${task.revision}` : ""}`, 32, 290);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "28px system-ui, sans-serif";
      ctx.fillText(`Diberikan oleh ${task.userName}`, 32, 340);
      if (speakerName) {
        ctx.fillStyle = "#34D399";
        ctx.font = "bold 30px system-ui, sans-serif";
        ctx.fillText(`🎤 Sedang bicara: ${speakerName}`, 32, 420);
      }
    }
    tex.needsUpdate = true;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}…` : line, x, y + lines * lh);
      lines++;
      if (lines >= maxLines) return;
      line = w;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + lines * lh);
}

/* ------------------------------------------------------------------ lounge */

function Lounge({ b }: { b: Building }) {
  const room = b.rooms.find((r) => r.id === "lounge");
  const sofa = useMemo(() => sofaGeometry("#0E7490", 2.4), []);
  const plant = useMemo(() => plantGeometry(1.2), []);
  if (!room) return null;
  const y = floorY(1);
  const cx = room.x + room.w / 2;
  return (
    <group>
      {placed(sofa, cx - 2.5, y, room.z + room.d - 2.2, Math.PI, "ls1")}
      {placed(sofa, cx + 1.5, y, room.z + room.d - 2.2, Math.PI, "ls2")}
      {/* meja pingpong */}
      <group position={[cx, y, room.z + 5.5]}>
        <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.74, 0.04, 1.52]} />
          <meshStandardMaterial color="#1E5AA8" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[0.02, 0.16, 1.6]} />
          <meshStandardMaterial color="#F8FAFC" transparent opacity={0.7} />
        </mesh>
        {[-1.1, 1.1].map((dx) => (
          <mesh key={dx} position={[dx, 0.37, 0]} castShadow>
            <boxGeometry args={[0.08, 0.74, 1.2]} />
            <primitive object={materials().deskLeg} attach="material" />
          </mesh>
        ))}
      </group>
      {/* meja kopi */}
      <group position={[room.x + 1.0, y, room.z + 2.5]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 1.0, 2.4]} />
          <meshStandardMaterial color="#F5F1EA" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.25, -0.4]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.45]} />
          <meshStandardMaterial color="#27272A" roughness={0.3} metalness={0.6} />
        </mesh>
      </group>
      {placed(plant, room.x + room.w - 0.8, y, room.z + 0.8, 0, "lp")}
    </group>
  );
}

/* ------------------------------------------------------------------ rakit */

export function Furniture({ b, agents, floor }: { b: Building; agents: Agent[]; floor: FloorId }) {
  return (
    <group>
      <Desks b={b} agents={agents} floor={floor} />
      {b.rooms
        .filter((r) => r.floor === floor && r.kind !== "lobby")
        .map((r) => (
          <RoomDecor key={r.id} room={r} />
        ))}
      {floor === 0 && <Lobby b={b} />}
      {floor === 0 && <MeetingRoom b={b} agents={agents} />}
      {floor === 1 && <Lounge b={b} />}
    </group>
  );
}

export { ROOM_WALL_H };
