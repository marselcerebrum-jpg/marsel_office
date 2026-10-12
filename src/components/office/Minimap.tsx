"use client";

import type { Agent } from "@/lib/types";
import type { OfficeLayout } from "./layout";
import { useOffice } from "./store";

const SIZE = 190;

export function Minimap({
  layout,
  onJump,
  hidden,
}: {
  layout: OfficeLayout;
  agents: Agent[];
  onJump: (p: { x: number; z: number }) => void;
  hidden?: boolean;
}) {
  const player = useOffice((s) => s.playerPos);
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const scale = SIZE / Math.max(maxX - minX, maxZ - minZ);
  const w = (maxX - minX) * scale;
  const h = (maxZ - minZ) * scale;
  const px = (x: number) => (x - minX) * scale;
  const pz = (z: number) => (z - minZ) * scale;

  if (hidden) return null;

  return (
    <div className="absolute bottom-3 right-3 hidden rounded-xl bg-white/90 p-2 shadow-lg backdrop-blur sm:block">
      <div className="mb-1 text-[11px] font-semibold text-slate-600">Denah · klik untuk pindah</div>
      <svg width={w} height={h} className="block cursor-pointer">
        {layout.rooms.map((r) => (
          <g key={r.id} onClick={() => onJump({ x: r.doorX, z: r.kind === "meeting" ? r.z + 2 : r.z + r.d - 1.5 })}>
            <title>{r.label}</title>
            <rect x={px(r.x)} y={pz(r.z)} width={r.w * scale} height={r.d * scale} fill={r.color} opacity={0.75} rx={2} />
          </g>
        ))}
        <circle cx={px(player.x)} cy={pz(player.z)} r={4} fill="#111827" stroke="white" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
