"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Agent } from "@/lib/types";
import { hasActiveFilters, matchesFilters } from "@/lib/filter";
import { floorY, ROOM_WALL_H, type Building, type FloorId } from "./building";
import { useOffice } from "./store";

/**
 * Label melayang digambar sebagai DOM biasa di atas canvas. Posisi layarnya
 * dihitung tiap frame oleh <LabelProjector> dan ditulis langsung ke style,
 * jadi bergerak mulus tanpa re-render React. Label lantai lain disembunyikan.
 */
type Entry = { el: HTMLElement; pos: THREE.Vector3; scaleRef: number; floorRef: { floor: FloorId } };
export const labelRegistry = new Map<string, Entry>();

function register(key: string, pos: [number, number, number], floor: FloorId, scaleRef = 14) {
  return (el: HTMLElement | null) => {
    if (el) {
      const prev = labelRegistry.get(key);
      // Pertahankan posisi yang sedang digerakkan (mis. agen yang berjalan).
      labelRegistry.set(key, prev ? { ...prev, el } : { el, pos: new THREE.Vector3(...pos), scaleRef, floorRef: { floor } });
    } else {
      const cur = labelRegistry.get(key);
      if (cur && !cur.el.isConnected) labelRegistry.delete(key);
    }
  };
}

const v = new THREE.Vector3();

export function LabelProjector() {
  useFrame(({ camera, size }) => {
    const view = useOffice.getState().viewFloor;
    for (const { el, pos, scaleRef, floorRef } of labelRegistry.values()) {
      v.copy(pos).project(camera);
      if (floorRef.floor !== view || v.z > 1 || v.z < -1) {
        el.style.display = "none";
        continue;
      }
      const dist = camera.position.distanceTo(pos);
      const scale = Math.min(1.2, Math.max(0.5, scaleRef / dist));
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.display = "";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale})`;
      el.style.zIndex = String(Math.round(1000 - dist * 5));
    }
  });
  return null;
}

export function LabelLayer({ agents, b }: { agents: Agent[]; b: Building }) {
  const nearby = useOffice((s) => s.nearbyIds);
  const selectedId = useOffice((s) => s.selectedId);
  const hoveredId = useOffice((s) => s.hoveredId);
  const filters = useOffice((s) => s.filters);
  const away = useOffice((s) => s.awayIds);
  const speakingId = useOffice((s) => s.speakingId);
  const speech = useOffice((s) => {
    if (!s.speakingId) return "";
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i];
      if (m.agentId === s.speakingId && m.streaming) return m.content;
    }
    return "";
  });
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const ids = new Set(nearby);
  if (hasActiveFilters(filters)) {
    const matched = agents.filter((a) => matchesFilters(a, filters));
    if (matched.length <= 30) matched.forEach((a) => ids.add(a.id));
  }
  away.forEach((id) => ids.add(id));
  if (selectedId) ids.add(selectedId);
  if (hoveredId) ids.add(hoveredId);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {b.rooms.map((room) => (
        <div
          key={`room-${room.floor}-${room.id}`}
          ref={register(
            `room-${room.floor}-${room.id}`,
            [room.doorX, floorY(room.floor) + ROOM_WALL_H + 0.55, room.side === "north" ? room.z + room.d : room.z],
            room.floor,
            30,
          )}
          className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-lg px-3 py-1 text-sm font-bold tracking-wide text-white shadow-lg"
          style={{ background: room.color, display: "none" }}
        >
          {room.label}
        </div>
      ))}
      {[...ids].map((id) => {
        const a = byId.get(id);
        const s = b.seats.get(id);
        if (!a || !s) return null;
        const strong = id === selectedId || id === hoveredId;
        const talking = id === speakingId;
        return (
          <div
            key={id}
            ref={register(id, [s.x, floorY(s.floor) + 1.95, s.z], s.floor)}
            className="absolute left-0 top-0 flex origin-bottom flex-col items-center"
            style={{ display: "none" }}
          >
            {talking && speech && (
              <div className="mb-1.5 w-max max-w-[260px] rounded-2xl bg-white px-3 py-2 text-left text-[12px] leading-snug text-slate-800 shadow-xl ring-1 ring-slate-200">
                {speech.length > 180 ? `…${speech.slice(-180)}` : speech}
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-amber-500 align-middle" />
              </div>
            )}
            <div className="text-3xl leading-none drop-shadow">{a.emoji}</div>
            <div
              className="mt-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold text-white shadow"
              style={{ background: talking ? "#059669" : strong ? "#111827" : "rgba(17,24,39,0.72)" }}
            >
              {talking ? "🎤 " : ""}
              {a.name}
            </div>
            {(strong || away.has(id)) && a.roleId && (
              <div className="mt-0.5 whitespace-nowrap rounded bg-white/85 px-1.5 text-[11px] font-medium text-slate-700">{a.roleId}</div>
            )}
          </div>
        );
      })}
      <div
        ref={register("__player", [b.spawn.x, 2.1, b.spawn.z], 0, 20)}
        className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-full bg-amber-500 px-2.5 py-0.5 text-[13px] font-bold text-white shadow"
        style={{ display: "none" }}
      >
        Anda
      </div>
    </div>
  );
}
