"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { Agent, Division, Runbook } from "@/lib/types";
import { buildLayout, standPoint } from "./layout";
import { OfficeScene } from "./Scene";
import { Catalog } from "./Catalog";
import { ProfilePanel } from "./ProfilePanel";
import { Minimap } from "./Minimap";
import { LabelLayer } from "./labels";
import { useOffice } from "./store";

export type OfficeProps = {
  agents: Agent[];
  divisions: Division[];
  runbooks: Runbook[];
  user?: { name: string; role: string } | null;
  headerSlot?: React.ReactNode;
};

export function OfficeApp({ agents, divisions, runbooks, headerSlot }: OfficeProps) {
  const layout = useMemo(() => buildLayout(agents, divisions), [agents, divisions]);
  const selectedId = useOffice((s) => s.selectedId);
  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const focusAgent = (id: string) => {
    const seat = layout.seats.get(id);
    if (!seat) return;
    useOffice.getState().select(id);
    useOffice.getState().teleportTo(standPoint(seat));
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#E7EEF6] text-slate-900">
      <Canvas camera={{ fov: 45, near: 0.1, far: 300 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <OfficeScene agents={agents} layout={layout} />
        </Suspense>
      </Canvas>
      <LabelLayer agents={agents} layout={layout} />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-xl">🏢</span>
          <div className="leading-tight">
            <div className="text-sm font-bold">Agency Office</div>
            <div className="text-[11px] text-slate-500">
              {agents.length} agen · {divisions.length} divisi
            </div>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">{headerSlot}</div>
      </header>

      <Catalog agents={agents} divisions={divisions} runbooks={runbooks} onPick={focusAgent} />
      {selected && <ProfilePanel key={selected.id} agent={selected} divisions={divisions} onClose={() => useOffice.getState().select(null)} />}
      <Minimap layout={layout} agents={agents} onJump={(p) => useOffice.getState().teleportTo(p)} hidden={!!selected} />
      <ControlsHint />
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-slate-900/75 px-4 py-1.5 text-xs text-white shadow md:block">
      <b>WASD</b> / panah untuk jalan · <b>Shift</b> lari · klik lantai untuk berjalan · seret mouse untuk memutar kamera · klik tokoh untuk profil
    </div>
  );
}
