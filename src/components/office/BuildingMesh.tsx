"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { FLOOR_H, floorY, ROOM_WALL_H, type Building, type FloorId, type Rect } from "./building";
import { BRAND, carpetTexture, grassTexture, logoTexture, materials, pavementTexture, textTexture, tileTexture, woodTexture } from "./materials";
import { useOffice } from "./store";

export type Box = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number };

/** Kotak-kotak ber-material sama digambar sebagai satu instanced mesh. */
export function Boxes({
  items,
  material,
  castShadow = false,
  receiveShadow = true,
  geometry,
}: {
  items: Box[];
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => geometry ?? new THREE.BoxGeometry(), [geometry]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(0, b.ry ?? 0, 0));
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.sx, b.sy, b.sz));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

const rectBox = (r: Rect, y: number, h: number): Box => ({ x: r.x + r.w / 2, y: y + h / 2, z: r.z + r.d / 2, sx: r.w, sy: h, sz: r.d });

/* ------------------------------------------------------------------ lantai */

function FloorPlane({ rect, y, material, onClick }: { rect: Rect; y: number; material: THREE.Material; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[rect.x + rect.w / 2, y, rect.z + rect.d / 2]} receiveShadow onClick={onClick}>
      <planeGeometry args={[rect.w, rect.d]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function useFloorMaterials(b: Building) {
  return useMemo(() => {
    const repeat = (t: THREE.Texture, rx: number, rz: number) => {
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.set(rx, rz);
      return c;
    };
    const byRoom = new Map<string, THREE.Material>();
    for (const r of b.rooms) {
      const key = `${r.floor}-${r.id}`;
      if (r.kind === "division") {
        byRoom.set(key, new THREE.MeshStandardMaterial({ map: repeat(carpetTexture(r.color), r.w / 2.5, r.d / 2.5), roughness: 0.98 }));
      } else {
        byRoom.set(key, new THREE.MeshStandardMaterial({ map: repeat(woodTexture(), r.w / 4, r.d / 4), roughness: 0.45, metalness: 0.02 }));
      }
    }
    const corridorW = b.hall.x - b.rooms[0].x;
    const tile = new THREE.MeshStandardMaterial({ map: repeat(tileTexture(), corridorW / 1.6, 5 / 1.6), roughness: 0.35 });
    const hallTile = new THREE.MeshStandardMaterial({ map: repeat(tileTexture(), b.hall.w / 1.6, b.hall.d / 1.6), roughness: 0.35 });
    return { byRoom, tile, hallTile };
  }, [b]);
}

function Floors({ b, floor }: { b: Building; floor: FloorId }) {
  const mats = useFloorMaterials(b);
  const walkTo = useOffice((s) => s.walkTo);
  const y = floorY(floor) + 0.01;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    walkTo({ x: e.point.x, z: e.point.z, floor });
  };
  const x0 = b.rooms[0].x;
  const corridor: Rect = { x: x0, z: b.corridor.z0, w: b.hall.x - x0, d: b.corridor.z1 - b.corridor.z0 };
  const s = b.stairs;
  // Lantai 2: hall dipotong lubang tangga.
  const hallRects: Rect[] =
    floor === 0
      ? [b.hall]
      : [
          { x: b.hall.x, z: b.hall.z, w: s.x - b.hall.x, d: b.hall.d },
          { x: s.x, z: b.hall.z, w: b.hall.x + b.hall.w - s.x, d: s.zTop - b.hall.z },
          { x: s.x + s.w, z: s.zTop, w: b.hall.x + b.hall.w - s.x - s.w, d: b.hall.z + b.hall.d - s.zTop },
        ];
  return (
    <group>
      {b.rooms
        .filter((r) => r.floor === floor)
        .map((r) => (
          <FloorPlane key={r.id} rect={r} y={y} material={mats.byRoom.get(`${floor}-${r.id}`)!} onClick={onClick} />
        ))}
      <FloorPlane rect={corridor} y={y} material={mats.tile} onClick={onClick} />
      {hallRects.map((r, i) => (
        <FloorPlane key={i} rect={r} y={y} material={mats.hallTile} onClick={onClick} />
      ))}
      {floor === 1 && (
        // Pelat beton lantai 2 (terlihat dari samping).
        <Boxes
          items={[...b.rooms.filter((r) => r.floor === 1), corridor, ...hallRects].map((r) => rectBox(r, FLOOR_H - 0.3, 0.3))}
          material={materials().exterior}
        />
      )}
    </group>
  );
}

/* ----------------------------------------------------------------- dinding */

function Walls({ b, floor }: { b: Building; floor: FloorId }) {
  const M = materials();
  const y0 = floorY(floor);
  const groups = useMemo(() => {
    const paint: Box[] = [];
    const ext: Box[] = [];
    const trim: Box[] = [];
    const glass: Box[] = [];
    const windows: Box[] = [];
    const rails: Box[] = [];
    for (const w of b.walls) {
      if (w.floor !== floor) continue;
      const cx = w.x + w.w / 2;
      const cz = w.z + w.d / 2;
      const along = w.w >= w.d ? "x" : "z";
      const len = along === "x" ? w.w : w.d;
      const seg = (y: number, h: number, list: Box[], grow = 0) =>
        list.push({ x: cx, y: y0 + y + h / 2, z: cz, sx: w.w + (along === "z" ? grow : 0), sy: h, sz: w.d + (along === "x" ? grow : 0) });
      if (w.kind === "partition") {
        seg(0, w.h, paint);
        seg(w.h, 0.06, trim, 0.04);
      } else if (w.kind === "glass") {
        seg(0, 0.1, trim, 0.03);
        seg(0.1, w.h - 0.2, glass);
        seg(w.h - 0.1, 0.1, trim, 0.03);
        const n = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          trim.push({
            x: along === "x" ? w.x + w.w * t : cx,
            y: y0 + w.h / 2,
            z: along === "z" ? w.z + w.d * t : cz,
            sx: 0.06,
            sy: w.h,
            sz: 0.06,
          });
        }
      } else if (w.kind === "exterior") {
        seg(0, 0.9, ext);
        seg(0.9, 2.1, windows);
        seg(3.0, w.h - 3.0, ext);
        const n = Math.max(1, Math.round(len / 2.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          trim.push({
            x: along === "x" ? w.x + w.w * t : cx,
            y: y0 + 1.95,
            z: along === "z" ? w.z + w.d * t : cz,
            sx: along === "x" ? 0.08 : w.w + 0.04,
            sy: 2.1,
            sz: along === "z" ? 0.08 : w.d + 0.04,
          });
        }
      } else if (w.kind === "exterior-low") {
        seg(0, w.h, ext);
        seg(w.h, 0.06, trim, 0.06);
      } else if (w.kind === "rail") {
        seg(0.05, w.h - 0.1, glass);
        seg(w.h - 0.05, 0.06, rails, 0.02);
      }
    }
    return { paint, ext, trim, glass, windows, rails };
  }, [b, floor, y0]);

  return (
    <group>
      <Boxes items={groups.paint} material={M.paint} castShadow />
      <Boxes items={groups.ext} material={M.exterior} castShadow />
      <Boxes items={groups.trim} material={M.trim} />
      <Boxes items={groups.rails} material={M.metal} />
      <Boxes items={groups.windows} material={M.windowGlass} receiveShadow={false} />
      <Boxes items={groups.glass} material={M.glass} receiveShadow={false} />
    </group>
  );
}

/* ------------------------------------------------------------ tangga & lift */

function Stairs({ b }: { b: Building }) {
  const M = materials();
  const s = b.stairs;
  const steps = 26;
  const run = (s.zBottom - s.zTop) / steps;
  const rise = FLOOR_H / steps;
  const treads: Box[] = [];
  const blocks: Box[] = [];
  for (let i = 0; i < steps; i++) {
    const z = s.zBottom - run * (i + 0.5);
    const top = rise * (i + 1);
    blocks.push({ x: s.x + s.w / 2, y: top / 2 - 0.02, z, sx: s.w, sy: top - 0.04, sz: run });
    treads.push({ x: s.x + s.w / 2, y: top - 0.02, z, sx: s.w + 0.04, sy: 0.05, sz: run + 0.03 });
  }
  const len = Math.hypot(s.zBottom - s.zTop, FLOOR_H);
  const angle = Math.atan2(FLOOR_H, s.zBottom - s.zTop);
  return (
    <group>
      <Boxes items={blocks} material={M.exterior} castShadow />
      <Boxes items={treads} material={M.deskWood} />
      {/* pegangan tangga sisi timur */}
      <mesh position={[s.x + s.w - 0.05, FLOOR_H / 2 + 0.95, (s.zTop + s.zBottom) / 2]} rotation-x={angle}>
        <boxGeometry args={[0.06, 0.06, len]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
    </group>
  );
}

function Elevator({ b, floor }: { b: Building; floor: FloorId }) {
  const M = materials();
  const y = floorY(floor);
  const { x, z } = b.elevator;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.45, -1.05]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 2.9, 1.6]} />
        <meshStandardMaterial color="#D6D3CE" roughness={0.7} />
      </mesh>
      {[-0.43, 0.43].map((dx) => (
        <mesh key={dx} position={[dx, 1.1, -0.24]}>
          <boxGeometry args={[0.84, 2.2, 0.04]} />
          <meshStandardMaterial color="#B8BEC6" roughness={0.25} metalness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 2.38, -0.23]}>
        <boxGeometry args={[0.5, 0.18, 0.02]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 2.38, -0.215]}>
        <planeGeometry args={[0.44, 0.13]} />
        <meshBasicMaterial map={textTexture(`lift-${floor}`, `▲▼ ${floor + 1}`, { bg: "#111827", fg: "#F59E0B", w: 256, h: 76 })} toneMapped={false} />
      </mesh>
      <mesh position={[1.05, 1.15, -0.22]}>
        <boxGeometry args={[0.12, 0.3, 0.03]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------- luar gedung */

function Exterior({ b }: { b: Building }) {
  const M = materials();
  const walkTo = useOffice((s) => s.walkTo);
  const grass = useMemo(() => {
    const t = grassTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(60, 60);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  const pave = useMemo(() => {
    const t = pavementTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(4, 6);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }, []);
  const lobby = b.rooms.find((r) => r.id === "lobby")!;
  const gx = lobby.x + lobby.w / 2;
  const front = lobby.z + lobby.d;
  const minX = b.rooms[0].x;
  const maxX = b.hall.x + b.hall.w;

  const trees = useMemo(() => {
    const list: { x: number; z: number; s: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let x = minX - 6; x <= maxX + 6; x += 7.5) {
      if (Math.abs(x - gx) < 6) continue;
      list.push({ x: x + rnd() * 2, z: front + 7 + rnd() * 3, s: 0.8 + rnd() * 0.6 });
      list.push({ x: x + rnd() * 2, z: b.hall.z - 6 - rnd() * 4, s: 0.9 + rnd() * 0.7 });
    }
    for (let z = b.hall.z - 4; z < front + 8; z += 7) {
      list.push({ x: minX - 6 - rnd() * 3, z, s: 0.9 + rnd() * 0.5 });
      list.push({ x: maxX + 6 + rnd() * 3, z, s: 0.9 + rnd() * 0.5 });
    }
    return list;
  }, [b, minX, maxX, gx, front]);

  const trunks: Box[] = trees.map((t) => ({ x: t.x, y: 1.1 * t.s, z: t.z, sx: 0.35 * t.s, sy: 2.2 * t.s, sz: 0.35 * t.s }));
  const foliageGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const foliage: Box[] = trees.flatMap((t) => [
    { x: t.x, y: 3 * t.s, z: t.z, sx: 1.9 * t.s, sy: 1.7 * t.s, sz: 1.9 * t.s },
    { x: t.x + 0.4 * t.s, y: 3.9 * t.s, z: t.z - 0.2, sx: 1.3 * t.s, sy: 1.2 * t.s, sz: 1.3 * t.s },
  ]);
  const foliageMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4E8A3E", roughness: 0.85, flatShading: true }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6B4A2F", roughness: 0.9 }), []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[320, 320]} />
        <primitive object={grass} attach="material" />
      </mesh>
      {/* pelataran & jalan menuju pintu lobby */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[gx, -0.01, front + 7]}
        receiveShadow
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          walkTo({ x: e.point.x, z: e.point.z, floor: 0 });
        }}
      >
        <planeGeometry args={[7, 14]} />
        <primitive object={pave} attach="material" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[(minX + maxX) / 2, -0.015, (b.hall.z + front) / 2]} receiveShadow>
        <planeGeometry args={[maxX - minX + 4, front - b.hall.z + 4]} />
        <meshStandardMaterial color="#B9B4AA" roughness={0.95} />
      </mesh>
      <Boxes items={trunks} material={trunkMat} castShadow />
      <Boxes items={foliage} material={foliageMat} geometry={foliageGeo} castShadow />
      {/* papan nama di depan gedung */}
      <group position={[gx + 6, 0, front + 5]} rotation-y={-0.25}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[4.4, 1.5, 0.5]} />
          <meshStandardMaterial color={BRAND.navy} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.8, 0.255]}>
          <planeGeometry args={[4.1, 1.25]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.8, 0.26]}>
          <planeGeometry args={[3.5, 1.22]} />
          <meshBasicMaterial map={logoTexture()} transparent toneMapped={false} />
        </mesh>
      </group>
      {/* lampu taman */}
      {[gx - 4, gx + 4].map((x) => (
        <group key={x} position={[x, 0, front + 4]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 2.8, 8]} />
            <primitive object={M.trim} attach="material" />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <sphereGeometry args={[0.22, 12, 8]} />
            <meshStandardMaterial color="#FFF7D6" emissive="#FFE8A3" emissiveIntensity={2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ rakit */

export function BuildingMesh({ b, viewFloor }: { b: Building; viewFloor: FloorId }) {
  return (
    <group>
      <Exterior b={b} />
      <Stairs b={b} />
      {/* Hanya lantai yang sedang dilihat yang dipasang (hemat GPU, dan klik tidak tertangkap lantai lain). */}
      <group key={viewFloor}>
        <Floors b={b} floor={viewFloor} />
        <Walls b={b} floor={viewFloor} />
        <Elevator b={b} floor={viewFloor} />
      </group>
    </group>
  );
}

export { ROOM_WALL_H };
