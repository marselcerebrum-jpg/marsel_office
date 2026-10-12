"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Agent } from "@/lib/types";
import { hasActiveFilters, matchesFilters } from "@/lib/filter";
import { WALL_H, type OfficeLayout } from "./layout";
import { useOffice } from "./store";

/**
 * Label melayang digambar sebagai DOM biasa di atas canvas. Posisi layarnya
 * dihitung tiap frame oleh <LabelProjector> dan ditulis langsung ke style,
 * jadi bergerak mulus tanpa re-render React.
 */
type Entry = { el: HTMLElement; pos: THREE.Vector3; scaleRef: number };
export const labelRegistry = new Map<string, Entry>();

function register(key: string, pos: [number, number, number], scaleRef = 14) {
  return (el: HTMLElement | null) => {
    if (el) labelRegistry.set(key, { el, pos: new THREE.Vector3(...pos), scaleRef });
    else labelRegistry.delete(key);
  };
}

const v = new THREE.Vector3();

export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const { el, pos, scaleRef } of labelRegistry.values()) {
      v.copy(pos).project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.display = "none";
        continue;
      }
      const dist = camera.position.distanceTo(pos);
      const scale = Math.min(1.25, Math.max(0.45, scaleRef / dist));
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.display = "";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale})`;
      el.style.zIndex = String(Math.round(1000 - dist * 5));
    }
  });
  return null;
}

export function LabelLayer({ agents, layout }: { agents: Agent[]; layout: OfficeLayout }) {
  const nearby = useOffice((s) => s.nearbyIds);
  const selectedId = useOffice((s) => s.selectedId);
  const hoveredId = useOffice((s) => s.hoveredId);
  const filters = useOffice((s) => s.filters);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const ids = new Set(nearby);
  if (hasActiveFilters(filters)) {
    const matched = agents.filter((a) => matchesFilters(a, filters));
    if (matched.length <= 30) matched.forEach((a) => ids.add(a.id));
  }
  if (selectedId) ids.add(selectedId);
  if (hoveredId) ids.add(hoveredId);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {layout.rooms.map((room) => (
        <div
          key={`room-${room.id}`}
          ref={register(`room-${room.id}`, [room.doorX, WALL_H + 0.8, room.kind === "meeting" ? room.z : room.z + room.d], 30)}
          className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-lg px-3 py-1 text-sm font-bold tracking-wide text-white shadow-lg"
          style={{ background: room.color, display: "none" }}
        >
          {room.label}
        </div>
      ))}
      {[...ids].map((id) => {
        const a = byId.get(id);
        const s = layout.seats.get(id);
        if (!a || !s) return null;
        const strong = id === selectedId || id === hoveredId;
        return (
          <div
            key={id}
            ref={register(id, [s.x, 2.05, s.z])}
            className="absolute left-0 top-0 flex origin-bottom flex-col items-center whitespace-nowrap"
            style={{ display: "none" }}
          >
            <div className="text-3xl leading-none drop-shadow">{a.emoji}</div>
            <div
              className="mt-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold text-white shadow"
              style={{ background: strong ? "#111827" : "rgba(17,24,39,0.72)" }}
            >
              {a.name}
            </div>
            {strong && a.roleId && (
              <div className="mt-0.5 rounded bg-white/85 px-1.5 text-[11px] font-medium text-slate-700">{a.roleId}</div>
            )}
          </div>
        );
      })}
      <div
        ref={register("__player", [layout.spawn.x, 2.1, layout.spawn.z], 20)}
        className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-full bg-amber-500 px-2.5 py-0.5 text-[13px] font-bold text-white shadow"
        style={{ display: "none" }}
      >
        Anda
      </div>
    </div>
  );
}
