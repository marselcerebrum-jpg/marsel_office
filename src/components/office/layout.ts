import type { Agent, Division } from "@/lib/types";

/** Satu ruangan divisi di lantai kantor (koordinat dunia, sumbu X–Z). */
export type Room = {
  id: string;
  label: string;
  color: string;
  x: number; // sudut kiri-atas (min X)
  z: number; // sudut kiri-atas (min Z)
  w: number;
  d: number;
  doorX: number; // pusat pintu di dinding selatan
  kind: "division" | "meeting" | "lobby";
};

export type Seat = {
  agentId: string;
  x: number;
  z: number;
  /** Rotasi Y tokoh: menghadap selatan (+Z) ke arah kamera awal. */
  rotY: number;
};

/** Segmen dinding sebagai kotak AABB untuk render dan tabrakan. */
export type Wall = { x: number; z: number; w: number; d: number; color: string };

export type OfficeLayout = {
  rooms: Room[];
  seats: Map<string, Seat>;
  walls: Wall[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number };
  meetingRoom: Room;
};

export const DESK_SX = 2.6; // jarak antar meja (X)
export const DESK_SZ = 3.0; // jarak antar baris (Z)
const ROOM_PAD = 1.8;
const CORRIDOR = 5;
const MAX_ROW_WIDTH = 84;
export const WALL_T = 0.25;
export const WALL_H = 0.95;
const DOOR_W = 3.2;

export function buildLayout(agents: Agent[], divisions: Division[]): OfficeLayout {
  const byDivision = new Map<string, Agent[]>();
  for (const a of agents) {
    const list = byDivision.get(a.division) ?? [];
    list.push(a);
    byDivision.set(a.division, list);
  }

  // Ukuran tiap ruangan dari jumlah agennya.
  const sized = divisions
    .filter((d) => byDivision.has(d.id))
    .map((d) => {
      const list = byDivision.get(d.id)!;
      const cols = Math.max(2, Math.min(10, Math.ceil(Math.sqrt(list.length * 1.4))));
      const rows = Math.ceil(list.length / cols);
      return {
        division: d,
        list,
        cols,
        rows,
        w: cols * DESK_SX + ROOM_PAD * 2,
        d: rows * DESK_SZ + ROOM_PAD * 2 + 1.2, // +1.2 untuk papan nama di depan
      };
    })
    .sort((a, b) => b.list.length - a.list.length);

  const rooms: Room[] = [];
  const seats = new Map<string, Seat>();

  // Lobby + ruang rapat di baris paling depan (selatan); divisi mengisi ke utara.
  let cursorZ = 0;
  let row: typeof sized = [];
  const rowsOut: (typeof sized)[] = [];
  let rowW = 0;
  for (const s of sized) {
    if (row.length && rowW + s.w > MAX_ROW_WIDTH) {
      rowsOut.push(row);
      row = [];
      rowW = 0;
    }
    row.push(s);
    rowW += s.w + CORRIDOR;
  }
  if (row.length) rowsOut.push(row);

  // Baris dari utara ke selatan: z negatif makin ke utara.
  const rowDepths = rowsOut.map((r) => Math.max(...r.map((s) => s.d)));
  const totalDepth = rowDepths.reduce((a, b) => a + b + CORRIDOR, 0);
  cursorZ = -totalDepth;

  rowsOut.forEach((r, ri) => {
    const width = r.reduce((a, s) => a + s.w, 0) + CORRIDOR * (r.length - 1);
    let cursorX = -width / 2;
    for (const s of r) {
      const room: Room = {
        id: s.division.id,
        label: s.division.label,
        color: s.division.color,
        x: cursorX,
        z: cursorZ + (rowDepths[ri] - s.d), // rata ke selatan agar pintu sejajar koridor
        w: s.w,
        d: s.d,
        doorX: cursorX + s.w / 2,
        kind: "division",
      };
      rooms.push(room);
      s.list.forEach((agent, i) => {
        const c = i % s.cols;
        const rr = Math.floor(i / s.cols);
        seats.set(agent.id, {
          agentId: agent.id,
          x: room.x + ROOM_PAD + DESK_SX * (c + 0.5),
          z: room.z + ROOM_PAD + DESK_SZ * (rr + 0.5),
          rotY: 0,
        });
      });
      cursorX += s.w + CORRIDOR;
    }
    cursorZ += rowDepths[ri] + CORRIDOR;
  });

  // Ruang rapat di selatan, tengah.
  const meetingRoom: Room = {
    id: "meeting",
    label: "Ruang Rapat",
    color: "#F59E0B",
    x: -9,
    z: cursorZ + 2,
    w: 18,
    d: 12,
    doorX: 0,
    kind: "meeting",
  };
  rooms.push(meetingRoom);

  // Dinding: utara, barat, timur penuh; selatan dengan celah pintu.
  // Ruang rapat: pintu di dinding utara (menghadap koridor ke kantor).
  const walls: Wall[] = [];
  for (const room of rooms) {
    const { x, z, w, d } = room;
    const doorOnNorth = room.kind === "meeting";
    const left = room.doorX - DOOR_W / 2 - x;
    const right = x + w - (room.doorX + DOOR_W / 2);
    const doorWallZ = doorOnNorth ? z : z + d - WALL_T;
    const solidWallZ = doorOnNorth ? z + d - WALL_T : z;
    walls.push({ x, z: solidWallZ, w, d: WALL_T, color: room.color });
    walls.push({ x, z, w: WALL_T, d, color: room.color });
    walls.push({ x: x + w - WALL_T, z, w: WALL_T, d, color: room.color });
    walls.push({ x, z: doorWallZ, w: left, d: WALL_T, color: room.color });
    walls.push({ x: x + w - right, z: doorWallZ, w: right, d: WALL_T, color: room.color });
  }

  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]);
  const zs = rooms.flatMap((r) => [r.z, r.z + r.d]);
  const bounds = {
    minX: Math.min(...xs) - 6,
    maxX: Math.max(...xs) + 6,
    minZ: Math.min(...zs) - 6,
    maxZ: Math.max(...zs) + 6,
  };

  return { rooms, seats, walls, bounds, spawn: { x: 0, z: meetingRoom.z - 2.5 }, meetingRoom };
}

/** Geser posisi dengan tabrakan lingkaran vs dinding (meluncur per sumbu). */
export function moveWithCollision(
  layout: OfficeLayout,
  from: { x: number; z: number },
  dx: number,
  dz: number,
  radius = 0.35,
): { x: number; z: number } {
  const hits = (px: number, pz: number) =>
    layout.walls.some((w) => {
      const cx = Math.max(w.x, Math.min(px, w.x + w.w));
      const cz = Math.max(w.z, Math.min(pz, w.z + w.d));
      return (px - cx) ** 2 + (pz - cz) ** 2 < radius * radius;
    });
  let { x, z } = from;
  if (!hits(x + dx, z)) x += dx;
  if (!hits(x, z + dz)) z += dz;
  const b = layout.bounds;
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), z: Math.min(b.maxZ, Math.max(b.minZ, z)) };
}

/** Titik berdiri di depan meja agen (sisi selatan), untuk teleport/jalan ke agen. */
export function standPoint(seat: Seat): { x: number; z: number } {
  return { x: seat.x, z: seat.z + 1.55 };
}
