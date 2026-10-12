import type { Agent, Division } from "@/lib/types";

/**
 * Gedung kantor 2 lantai. Tiap lantai: dua baris ruangan (utara & selatan) di kiri-kanan
 * koridor tengah yang membentang barat–timur, plus hall tangga + lift di ujung timur.
 * Koordinat dunia: X ke timur, Z ke selatan, Y ke atas. Kamera default memandang ke utara.
 */

export type FloorId = 0 | 1;
export const FLOOR_H = 4.6;
export const floorY = (f: FloorId) => f * FLOOR_H;

export type RoomKind = "division" | "meeting" | "lobby" | "lounge";

export type Room = {
  id: string;
  label: string;
  color: string;
  kind: RoomKind;
  floor: FloorId;
  side: "north" | "south";
  x: number;
  z: number;
  w: number;
  d: number;
  doorX: number;
};

export type Seat = { agentId: string; floor: FloorId; x: number; z: number; roomId: string };

export type WallKind = "glass" | "partition" | "exterior" | "exterior-low" | "rail";
export type Wall = { floor: FloorId; x: number; z: number; w: number; d: number; kind: WallKind; h: number };

export type Rect = { x: number; z: number; w: number; d: number };

export type Stairs = {
  /** Lajur tangga: dari bawah (selatan, lantai 1) naik ke utara (lantai 2). */
  x: number;
  w: number;
  zBottom: number;
  zTop: number;
};

export type Building = {
  rooms: Room[];
  seats: Map<string, Seat>;
  walls: Wall[];
  desks: { floor: FloorId; x: number; z: number; agentId: string }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  hall: Rect;
  stairs: Stairs;
  elevator: { x: number; z: number };
  spawn: { x: number; z: number };
  taskDesk: { x: number; z: number };
  meeting: { room: Room; center: { x: number; z: number }; chairs: { x: number; z: number; rotY: number }[] };
  corridor: { z0: number; z1: number };
};

export const DESK_SX = 2.5;
export const DESK_SZ = 3.0;
const DESK_ROWS = 4;
const PAD_X = 1.4;
const PAD_Z = 1.6;
const ROOM_D = DESK_ROWS * DESK_SZ + PAD_Z * 2;
const CORRIDOR_W = 5;
const HALL_W = 11;
const MIN_ROOM_W = 7.2;
export const WALL_T = 0.18;
const DOOR_W = 2.6;
export const ROOM_WALL_H = 2.7;
const STAIR_LEN = 16;

type RoomSpec = { id: string; kind: RoomKind; label?: string; color?: string; w?: number };

/** Susunan ruangan per lantai. Divisi yang sering rapat diletakkan di lantai 1. */
const PLAN: Record<FloorId, { north: RoomSpec[]; south: RoomSpec[] }> = {
  0: {
    north: [
      { id: "specialized", kind: "division" },
      { id: "marketing", kind: "division" },
      { id: "project-management", kind: "division" },
    ],
    south: [
      { id: "lobby", kind: "lobby", label: "Lobby & Meja Tugas", color: "#D97706", w: 15 },
      { id: "meeting", kind: "meeting", label: "Ruang Rapat", color: "#F59E0B", w: 19 },
      { id: "cerebrum-product", kind: "division" },
      { id: "sales", kind: "division" },
      { id: "product", kind: "division" },
      { id: "support", kind: "division" },
      { id: "finance", kind: "division" },
    ],
  },
  1: {
    north: [
      { id: "engineering", kind: "division" },
      { id: "game-development", kind: "division" },
      { id: "gis", kind: "division" },
    ],
    south: [
      { id: "lounge", kind: "lounge", label: "Lounge", color: "#0EA5E9", w: 12 },
      { id: "security", kind: "division" },
      { id: "design", kind: "division" },
      { id: "testing", kind: "division" },
      { id: "paid-media", kind: "division" },
      { id: "academic", kind: "division" },
      { id: "spatial-computing", kind: "division" },
      { id: "research", kind: "division" },
      { id: "healthcare", kind: "division" },
    ],
  },
};

export function buildBuilding(agents: Agent[], divisions: Division[]): Building {
  const byDivision = new Map<string, Agent[]>();
  for (const a of agents) byDivision.set(a.division, [...(byDivision.get(a.division) ?? []), a]);
  const divById = new Map(divisions.map((d) => [d.id, d]));

  // Divisi baru yang belum ada di PLAN masuk ke baris selatan lantai 2 agar tidak hilang.
  const planned = new Set(Object.values(PLAN).flatMap((f) => [...f.north, ...f.south].map((r) => r.id)));
  for (const d of divisions) if (byDivision.has(d.id) && !planned.has(d.id)) PLAN[1].south.push({ id: d.id, kind: "division" });

  const widthOf = (spec: RoomSpec) => {
    if (spec.w) return spec.w;
    const n = byDivision.get(spec.id)?.length ?? 0;
    return Math.max(MIN_ROOM_W, Math.ceil(n / DESK_ROWS) * DESK_SX + PAD_X * 2);
  };

  const rowW = (row: RoomSpec[]) => row.reduce((s, r) => s + widthOf(r), 0);
  const W = Math.max(...([0, 1] as FloorId[]).flatMap((f) => [rowW(PLAN[f].north), rowW(PLAN[f].south)]));
  const totalW = W + HALL_W;
  const x0 = -totalW / 2;
  const cz0 = -CORRIDOR_W / 2;
  const cz1 = CORRIDOR_W / 2;
  const zMin = cz0 - ROOM_D;
  const zMax = cz1 + ROOM_D;

  const rooms: Room[] = [];
  const seats = new Map<string, Seat>();
  const desks: Building["desks"] = [];

  for (const f of [0, 1] as FloorId[]) {
    for (const side of ["north", "south"] as const) {
      const row = PLAN[f][side];
      const extra = W - rowW(row);
      let cx = x0;
      row.forEach((spec, i) => {
        // Ruangan terakhir di baris melebar agar gedung berbentuk persegi panjang rapi.
        const w = widthOf(spec) + (i === row.length - 1 ? extra : 0);
        const div = divById.get(spec.id);
        const room: Room = {
          id: spec.id,
          label: spec.label ?? div?.label ?? spec.id,
          color: spec.color ?? div?.color ?? "#64748B",
          kind: spec.kind,
          floor: f,
          side,
          x: cx,
          z: side === "north" ? zMin : cz1,
          w,
          d: ROOM_D,
          doorX: cx + w / 2,
        };
        rooms.push(room);
        if (spec.kind === "division") {
          const list = byDivision.get(spec.id) ?? [];
          const cols = Math.max(1, Math.ceil(list.length / DESK_ROWS));
          const gridW = cols * DESK_SX;
          const startX = room.x + (room.w - gridW) / 2;
          list.forEach((agent, k) => {
            const c = k % cols;
            const r = Math.floor(k / cols);
            const seat: Seat = {
              agentId: agent.id,
              floor: f,
              roomId: room.id,
              x: startX + DESK_SX * (c + 0.5),
              z: room.z + PAD_Z + DESK_SZ * r + 0.7,
            };
            seats.set(agent.id, seat);
            desks.push({ floor: f, x: seat.x, z: seat.z, agentId: agent.id });
          });
        }
        cx += w;
      });
    }
  }

  /* ------------------------------------------------------------- dinding */
  const walls: Wall[] = [];
  const wall = (floor: FloorId, x: number, z: number, w: number, d: number, kind: WallKind, h = ROOM_WALL_H) => {
    if (w > 0.01 && d > 0.01) walls.push({ floor, x, z, w, d, kind, h });
  };

  for (const r of rooms) {
    const f = r.floor;
    // Dinding sisi koridor: kaca dengan pintu.
    const cz = r.side === "north" ? r.z + r.d - WALL_T : r.z;
    const left = r.doorX - DOOR_W / 2 - r.x;
    wall(f, r.x, cz, left, WALL_T, "glass");
    wall(f, r.doorX + DOOR_W / 2, cz, r.x + r.w - (r.doorX + DOOR_W / 2), WALL_T, "glass");
    // Dinding luar (utara penuh, selatan rendah agar kamera tetap bisa melihat ke dalam).
    if (r.side === "north") wall(f, r.x, r.z, r.w, WALL_T, "exterior", FLOOR_H);
    else wall(f, r.x, r.z + r.d - WALL_T, r.w, WALL_T, "exterior-low", 1.0);
    // Sekat antar ruangan (sisi barat tiap ruangan; ruangan pertama = dinding luar barat).
    const isFirst = Math.abs(r.x - x0) < 0.01;
    wall(f, r.x, r.z, WALL_T, r.d, isFirst ? "exterior" : "partition", isFirst ? FLOOR_H : ROOM_WALL_H);
  }

  // Lobby: pintu masuk di dinding selatan (ganti dinding rendah dengan celah pintu).
  const lobby = rooms.find((r) => r.id === "lobby")!;
  {
    const idx = walls.findIndex((w) => w.floor === 0 && w.kind === "exterior-low" && Math.abs(w.x - lobby.x) < 0.01);
    walls.splice(idx, 1);
    const gap = 3.4;
    const gx = lobby.x + lobby.w / 2;
    wall(0, lobby.x, lobby.z + lobby.d - WALL_T, gx - gap / 2 - lobby.x, WALL_T, "exterior-low", 1.0);
    wall(0, gx + gap / 2, lobby.z + lobby.d - WALL_T, lobby.x + lobby.w - (gx + gap / 2), WALL_T, "exterior-low", 1.0);
  }

  // Hall tangga di timur: dinding luar utara/timur/selatan; sisi barat terbuka ke koridor.
  const hall: Rect = { x: x0 + W, z: zMin, w: HALL_W, d: zMax - zMin };
  const stairs: Stairs = { x: hall.x + HALL_W - 3.6, w: 3.0, zBottom: 9.5, zTop: 9.5 - STAIR_LEN };
  for (const f of [0, 1] as FloorId[]) {
    wall(f, hall.x, hall.z, hall.w, WALL_T, "exterior", FLOOR_H);
    wall(f, hall.x + hall.w - WALL_T, hall.z, WALL_T, hall.d, "exterior", FLOOR_H);
    wall(f, hall.x, hall.z + hall.d - WALL_T, hall.w, WALL_T, "exterior-low", 1.0);
    // Sekat hall ↔ ruangan (biarkan koridor terbuka).
    wall(f, hall.x, hall.z, WALL_T, cz0 - hall.z, "partition");
    wall(f, hall.x, cz1, WALL_T, hall.z + hall.d - cz1, "partition");
  }
  // Pagar tangga. Lantai 1: sisi barat & ujung utara ditutup (masuk dari selatan).
  // Lantai 2: pagar mengelilingi lubang tangga kecuali ujung utara (keluar ke lantai 2).
  wall(0, stairs.x - 0.12, stairs.zTop, 0.12, STAIR_LEN, "rail", 1.0);
  wall(0, stairs.x, stairs.zTop - 0.12, stairs.w, 0.12, "rail", 1.0);
  wall(1, stairs.x - 0.12, stairs.zTop, 0.12, STAIR_LEN + 0.12, "rail", 1.0);
  wall(1, stairs.x - 0.12, stairs.zBottom, stairs.w + 0.12, 0.12, "rail", 1.0);

  /* ---------------------------------------------------------- ruang rapat */
  const mr = rooms.find((r) => r.id === "meeting")!;
  const center = { x: mr.x + mr.w / 2, z: mr.z + mr.d / 2 + 0.6 };
  const chairs = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + Math.PI; // kursi 0 di sisi utara (kepala meja)
    return { x: center.x + Math.sin(a) * 3.3, z: center.z + Math.cos(a) * 3.3, rotY: a + Math.PI };
  });

  const taskDesk = { x: lobby.x + lobby.w / 2, z: lobby.z + 6 };
  return {
    rooms,
    seats,
    walls,
    desks,
    bounds: { minX: x0 - 1, maxX: x0 + totalW + 1, minZ: zMin - 1, maxZ: zMax + 14 },
    hall,
    stairs,
    elevator: { x: hall.x + 2.4, z: hall.z + 2.6 },
    spawn: { x: taskDesk.x, z: zMax + 4 },
    taskDesk,
    meeting: { room: mr, center, chairs },
    corridor: { z0: cz0, z1: cz1 },
  };
}

/* ------------------------------------------------------------ pergerakan */

export type Pos = { x: number; z: number; floor: FloorId; y: number };

const inStairs = (b: Building, x: number, z: number) =>
  x >= b.stairs.x && x <= b.stairs.x + b.stairs.w && z >= b.stairs.zTop && z <= b.stairs.zBottom;

/** Tinggi lantai tangga di titik z (0 di bawah, FLOOR_H di atas). */
export const stairsY = (b: Building, z: number) =>
  ((b.stairs.zBottom - Math.min(b.stairs.zBottom, Math.max(b.stairs.zTop, z))) / (b.stairs.zBottom - b.stairs.zTop)) * FLOOR_H;

function blocked(b: Building, floor: FloorId, x: number, z: number, r: number) {
  for (const w of b.walls) {
    if (w.floor !== floor) continue;
    const cx = Math.max(w.x, Math.min(x, w.x + w.w));
    const cz = Math.max(w.z, Math.min(z, w.z + w.d));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  }
  return false;
}

/**
 * Gerak dengan tabrakan dinding + logika tangga. Dinding yang dipakai adalah dinding
 * lantai tempat pemain berada; di lajur tangga lantainya mengikuti ketinggian
 * (setengah bawah = lantai 1, setengah atas = lantai 2). Pagar tangga sudah diatur
 * per lantai sehingga hanya ujung bawah (lantai 1) dan ujung atas (lantai 2) yang terbuka.
 */
export function step(b: Building, p: Pos, dx: number, dz: number, r = 0.32): Pos {
  let { x, z, floor } = p;
  if (!blocked(b, floor, x + dx, z, r)) x += dx;
  if (!blocked(b, floor, x, z + dz, r)) z += dz;
  x = Math.min(b.bounds.maxX, Math.max(b.bounds.minX, x));
  z = Math.min(b.bounds.maxZ, Math.max(b.bounds.minZ, z));
  // Lantai 2 tidak punya halaman: tetap di dalam gedung.
  if (floor === 1) z = Math.min(z, b.hall.z + b.hall.d - 0.4);
  let y = floorY(floor);
  if (inStairs(b, x, z)) {
    y = stairsY(b, z);
    floor = y > FLOOR_H / 2 ? 1 : 0;
  }
  return { x, z, floor, y };
}

function rectHit(w: Rect, x: number, z: number, r: number) {
  const cx = Math.max(w.x, Math.min(x, w.x + w.w));
  const cz = Math.max(w.z, Math.min(z, w.z + w.d));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/* ------------------------------------------------------------- navigasi */

const CELL = 0.5;

type Grid = { floor: FloorId; ox: number; oz: number; cols: number; rows: number; free: Uint8Array };

const gridCache = new WeakMap<Building, Grid[]>();

function grids(b: Building): Grid[] {
  let g = gridCache.get(b);
  if (g) return g;
  g = ([0, 1] as FloorId[]).map((floor) => {
    const ox = b.bounds.minX;
    const oz = b.bounds.minZ;
    const cols = Math.ceil((b.bounds.maxX - ox) / CELL);
    const rows = Math.ceil((b.bounds.maxZ - oz) / CELL);
    const free = new Uint8Array(cols * rows);
    const deskRects = b.desks.filter((d) => d.floor === floor).map((d) => ({ x: d.x - 0.8, z: d.z + 0.3, w: 1.6, d: 0.8 }));
    const mt = floor === 0 ? b.meeting.center : null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + (c + 0.5) * CELL;
        const z = oz + (r + 0.5) * CELL;
        let ok = !blocked(b, floor, x, z, 0.3) && !inStairs(b, x, z);
        if (ok && deskRects.some((d) => rectHit(d, x, z, 0.25))) ok = false;
        if (ok && mt && (x - mt.x) ** 2 + (z - mt.z) ** 2 < 2.9 ** 2) ok = false;
        if (ok && floor === 1 && z > b.hall.z + b.hall.d - 0.4) ok = false;
        free[r * cols + c] = ok ? 1 : 0;
      }
    }
    return { floor, ox, oz, cols, rows, free };
  });
  gridCache.set(b, g);
  return g;
}

function nearestFree(g: Grid, c: number, r: number): [number, number] {
  for (let rad = 0; rad < 8; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < g.cols && rr < g.rows && g.free[rr * g.cols + cc]) return [cc, rr];
      }
    }
  }
  return [c, r];
}

/** A* di grid satu lantai. Mengembalikan titik-titik jalur (sudah dirapikan). */
function astar(g: Grid, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
  const toCell = (p: { x: number; z: number }) =>
    nearestFree(g, Math.floor((p.x - g.ox) / CELL), Math.floor((p.z - g.oz) / CELL));
  const [sc, sr] = toCell(from);
  const [tc, tr] = toCell(to);
  const N = g.cols * g.rows;
  const start = sr * g.cols + sc;
  const goal = tr * g.cols + tc;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (i: number) => Math.hypot((i % g.cols) - tc, Math.floor(i / g.cols) - tr);
  gScore[start] = 0;
  push(h(start), start);
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = nr * g.cols + nc;
      if (!g.free[ni] || closed[ni]) continue;
      // Larang memotong sudut dinding secara diagonal.
      if (dc && dr && (!g.free[cr * g.cols + nc] || !g.free[nr * g.cols + cc])) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur;
        push(ng + h(ni), ni);
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return [from, to];
  const cells: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: g.ox + ((i % g.cols) + 0.5) * CELL, z: g.oz + (Math.floor(i / g.cols) + 0.5) * CELL }));
  return simplify(g, [from, ...pts.slice(1, -1), to]);
}

/** Buang titik yang bisa dilompati dengan garis lurus bebas hambatan. */
function simplify(g: Grid, pts: { x: number; z: number }[]) {
  const clear = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5));
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const z = a.z + ((b.z - a.z) * i) / n;
      const c = Math.floor((x - g.ox) / CELL);
      const r = Math.floor((z - g.oz) / CELL);
      if (!g.free[r * g.cols + c]) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

export type Waypoint = { x: number; z: number; y: number; floor: FloorId };

/** Jalur lengkap antar titik, termasuk lewat tangga bila beda lantai. */
export function findPath(b: Building, from: { x: number; z: number; floor: FloorId }, to: { x: number; z: number; floor: FloorId }): Waypoint[] {
  const [g0, g1] = grids(b);
  const wp = (p: { x: number; z: number }, floor: FloorId): Waypoint => ({ ...p, floor, y: floorY(floor) });
  if (from.floor === to.floor) return astar(from.floor === 0 ? g0 : g1, from, to).map((p) => wp(p, from.floor));
  const sx = b.stairs.x + b.stairs.w / 2;
  const bottom = { x: sx, z: b.stairs.zBottom + 0.8 };
  const top = { x: sx, z: b.stairs.zTop - 0.8 };
  if (from.floor === 1) {
    return [
      ...astar(g1, from, top).map((p) => wp(p, 1)),
      { x: sx, z: b.stairs.zTop, y: FLOOR_H, floor: 1 },
      { x: sx, z: b.stairs.zBottom, y: 0, floor: 0 },
      ...astar(g0, bottom, to).map((p) => wp(p, 0)),
    ];
  }
  return [
    ...astar(g0, from, bottom).map((p) => wp(p, 0)),
    { x: sx, z: b.stairs.zBottom, y: 0, floor: 0 },
    { x: sx, z: b.stairs.zTop, y: FLOOR_H, floor: 1 },
    ...astar(g1, top, to).map((p) => wp(p, 1)),
  ];
}

/** Titik keluar dari kursi (di belakang kursi, sisi utara) agar jalur tidak menembus meja. */
export const seatExit = (s: Seat) => ({ x: s.x, z: s.z - 0.9 });
/** Titik berdiri di depan meja agen (sisi selatan). */
export const deskFront = (s: Seat) => ({ x: s.x, z: s.z + 1.75 });
