"use client";

import type { Building } from "./building";
import { useOffice } from "./store";

const WIDTH = 230;

export function Minimap({ b, hidden }: { b: Building; hidden?: boolean }) {
  const player = useOffice((s) => s.playerPos);
  const viewFloor = useOffice((s) => s.viewFloor);
  const task = useOffice((s) => s.task);
  if (hidden) return null;
  const minX = b.rooms[0].x;
  const maxX = b.hall.x + b.hall.w;
  const minZ = b.hall.z;
  const maxZ = b.hall.z + b.hall.d;
  const scale = WIDTH / (maxX - minX);
  const h = (maxZ - minZ) * scale;
  const px = (x: number) => (x - minX) * scale;
  const pz = (z: number) => (z - minZ) * scale;
  const live = task && ["gathering", "meeting"].includes(task.status);

  return (
    <div className="absolute bottom-3 right-3 z-10 hidden rounded-xl bg-white/92 p-2 shadow-lg backdrop-blur sm:block">
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
        <span>Denah Lantai {viewFloor + 1}</span>
        <span className="text-slate-400">klik ruangan untuk pindah</span>
      </div>
      <svg width={WIDTH} height={h} className="block cursor-pointer rounded bg-slate-100">
        {b.rooms
          .filter((r) => r.floor === viewFloor)
          .map((r) => (
            <g
              key={r.id}
              onClick={() =>
                useOffice.getState().teleportTo({ x: r.doorX, z: r.side === "north" ? r.z + r.d - 1.4 : r.z + 1.4, floor: r.floor })
              }
            >
              <title>{r.label}</title>
              <rect x={px(r.x) + 0.5} y={pz(r.z) + 0.5} width={r.w * scale - 1} height={r.d * scale - 1} fill={r.color} opacity={0.8} rx={2} />
              {r.id === "meeting" && live && (
                <circle cx={px(r.x + r.w / 2)} cy={pz(r.z + r.d / 2)} r={5} fill="#10B981" className="animate-pulse" />
              )}
            </g>
          ))}
        <rect x={px(b.stairs.x)} y={pz(b.stairs.zTop)} width={b.stairs.w * scale} height={(b.stairs.zBottom - b.stairs.zTop) * scale} fill="#94A3B8" />
        <text x={px(b.stairs.x) + 2} y={pz(b.stairs.zTop) - 2} fontSize={8} fill="#475569">
          tangga
        </text>
        {player.floor === viewFloor && <circle cx={px(player.x)} cy={pz(player.z)} r={4} fill="#111827" stroke="white" strokeWidth={1.5} />}
      </svg>
    </div>
  );
}
