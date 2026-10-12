"use client";

import Image from "next/image";
import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { Agent, Division, Runbook } from "@/lib/types";
import { buildBuilding, deskFront, type Building, type FloorId } from "./building";
import { Catalog } from "./Catalog";
import { LabelLayer } from "./labels";
import { Minimap } from "./Minimap";
import { ProfilePanel } from "./ProfilePanel";
import { OfficeScene } from "./Scene";
import { useOffice, type Quality } from "./store";
import { TaskComposer, TaskList, TaskPanel, type Leads } from "./TaskUI";
import { api, STATUS_LABEL, useTaskSync } from "./useTasks";

export type OfficeUser = { id: number; name: string; username: string; role: "admin" | "member" };

export type OfficeProps = {
  agents: Agent[];
  divisions: Division[];
  runbooks: Runbook[];
  leads: Leads;
  user: OfficeUser;
};

export function OfficeApp({ agents, divisions, runbooks, leads, user }: OfficeProps) {
  const b = useMemo(() => buildBuilding(agents, divisions), [agents, divisions]);
  const selectedId = useOffice((s) => s.selectedId);
  const panel = useOffice((s) => s.panel);
  const quality = useOffice((s) => s.quality);
  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const { tasks, focus, refresh } = useTaskSync(user.id);

  const focusAgent = (id: string) => {
    const seat = b.seats.get(id);
    if (!seat) return;
    const st = useOffice.getState();
    st.select(id);
    st.teleportTo({ ...deskFront(seat), floor: seat.floor });
    if (st.panel === "task" || st.panel === "tasks") st.openPanel(null);
  };

  const goMeeting = () => {
    const r = b.meeting.room;
    useOffice.getState().teleportTo({ x: b.meeting.center.x + 2.5, z: r.z + r.d - 1.6, floor: 0 });
  };

  const openTask = (id: number) => {
    focus(id);
    useOffice.getState().select(null);
    useOffice.getState().openPanel("task");
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#D8E4EE] text-slate-900">
      <Canvas
        shadows={quality !== "rendah" ? "percentage" : false}
        camera={{ fov: 45, near: 0.1, far: 400 }}
        dpr={quality === "rendah" ? 1 : [1, 1.75]}
        gl={{
          antialias: quality === "rendah",
          toneMapping: quality === "rendah" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
          powerPreference: "high-performance",
        }}
      >
        <Suspense fallback={null}>
          <OfficeScene agents={agents} b={b} />
        </Suspense>
      </Canvas>
      <LabelLayer agents={agents} b={b} />

      <TopBar user={user} tasks={tasks} b={b} agentCount={agents.length} />
      <MeetingTicker onOpen={() => useOffice.getState().openPanel("task")} onGo={goMeeting} />
      <Catalog agents={agents} divisions={divisions} runbooks={runbooks} onPick={focusAgent} />

      {panel === "task" && (
        <TaskPanel
          agents={agents}
          meId={user.id}
          isAdmin={user.role === "admin"}
          onGoMeeting={goMeeting}
          onBack={() => useOffice.getState().openPanel("tasks")}
        />
      )}
      {panel === "tasks" && <TaskList tasks={tasks} meId={user.id} onOpen={openTask} />}
      {!panel && selected && (
        <ProfilePanel
          key={selected.id}
          agent={selected}
          divisions={divisions}
          onClose={() => useOffice.getState().select(null)}
          onInvite={(id) => useOffice.getState().inviteToMeeting(id)}
          isAdmin={user.role === "admin"}
        />
      )}
      {panel === "compose" && (
        <TaskComposer
          agents={agents}
          divisions={divisions}
          leads={leads}
          onCreated={(id) => {
            refresh();
            openTask(id);
          }}
        />
      )}

      <Minimap b={b} hidden={!!panel || !!selected} />
      <BottomHint />
    </div>
  );
}

/* ------------------------------------------------------------------- HUD */

function TopBar({ user, tasks, b, agentCount }: { user: OfficeUser; tasks: { status: string; userId: number }[]; b: Building; agentCount: number }) {
  const viewFloor = useOffice((s) => s.viewFloor);
  const quality = useOffice((s) => s.quality);
  const setQuality = useOffice((s) => s.setQuality);
  const catalogOpen = useOffice((s) => s.catalogOpen);
  const [menu, setMenu] = useState(false);
  const pending = tasks.filter((t) => t.status === "review" && t.userId === user.id).length;
  const running = tasks.filter((t) => ["routing", "gathering", "meeting"].includes(t.status)).length;

  // Naik lift: muncul di depan pintu lift lantai tujuan.
  const goFloor = (f: FloorId) => useOffice.getState().teleportTo({ x: b.elevator.x, z: b.elevator.z + 1.4, floor: f });

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <Image src="/brand/agent-desk-logo.png" alt="Agent Desk" width={1364} height={474} priority className="h-8 w-auto" />
          <div className="hidden border-l border-slate-200 pl-2 text-[11px] leading-tight text-slate-500 lg:block">
            {agentCount} agen
            <br />2 lantai
          </div>
        </div>
        <div className="flex overflow-hidden rounded-xl bg-white/95 shadow-lg" role="group" aria-label="Pindah lantai">
          {([0, 1] as FloorId[]).map((f) => (
            <button
              key={f}
              onClick={() => goFloor(f)}
              className={`px-3 py-2 text-sm font-bold ${viewFloor === f ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              title={`Naik lift ke lantai ${f + 1}`}
            >
              🛗 Lt {f + 1}
            </button>
          ))}
        </div>
        <button
          onClick={() => useOffice.getState().setCatalogOpen(!catalogOpen)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-lg ${catalogOpen ? "bg-slate-800 text-white" : "bg-white/95 hover:bg-white"}`}
        >
          🔎 Direktori
        </button>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => useOffice.getState().openPanel("compose")}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-amber-600"
        >
          📥 Kirim Tugas
        </button>
        <button
          onClick={() => useOffice.getState().openPanel("tasks")}
          className="relative rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow-lg hover:bg-white"
        >
          📋 Tugas
          {(pending > 0 || running > 0) && (
            <span className={`absolute -right-1.5 -top-1.5 rounded-full px-1.5 text-[11px] font-bold text-white ${pending ? "bg-red-500" : "bg-emerald-500"}`}>
              {pending || running}
            </span>
          )}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow-lg hover:bg-white"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] text-white">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="hidden sm:inline">{user.name}</span>
          </button>
          {menu && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl bg-white text-sm shadow-xl ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                Masuk sebagai <b>{user.username}</b> ({user.role === "admin" ? "admin" : "anggota"})
              </div>
              <div className="px-3 py-2">
                <div className="mb-1 text-xs font-semibold text-slate-500">Kualitas grafis</div>
                <div className="flex gap-1">
                  {(["rendah", "sedang", "tinggi"] as Quality[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`flex-1 rounded-md px-2 py-1 text-xs capitalize ${quality === q ? "bg-amber-500 font-bold text-white" : "bg-slate-100"}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              {user.role === "admin" && (
                <a href="/admin" className="block px-3 py-2 hover:bg-slate-50">
                  👥 Kelola tim
                </a>
              )}
              <button
                onClick={async () => {
                  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
                  window.location.href = "/login";
                }}
                className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Kartu kecil di tengah atas saat ada rapat berjalan atau menunggu review. */
function MeetingTicker({ onOpen, onGo }: { onOpen: () => void; onGo: () => void }) {
  const task = useOffice((s) => s.task);
  const panel = useOffice((s) => s.panel);
  const speakingId = useOffice((s) => s.speakingId);
  if (!task || panel === "task" || ["approved", "rejected"].includes(task.status)) return null;
  const live = ["routing", "gathering", "meeting"].includes(task.status);
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[68px] z-10 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full bg-brand-navy/90 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-xl backdrop-blur">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? "animate-pulse bg-emerald-400" : task.status === "review" ? "bg-amber-400" : "bg-red-400"}`}
      />
      <span className="min-w-0 truncate">
        <b>{STATUS_LABEL[task.status]}</b> · {task.title}
        {speakingId && <span className="text-white/60"> · 🎤 sedang bicara</span>}
      </span>
      {live && (
        <button onClick={onGo} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">
          Ke ruang rapat
        </button>
      )}
      <button onClick={onOpen} className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold hover:bg-amber-600">
        {task.status === "review" ? "Review" : "Lihat"}
      </button>
    </div>
  );
}

function BottomHint() {
  const near = useOffice((s) => s.nearTaskDesk);
  const panel = useOffice((s) => s.panel);
  if (near && panel !== "compose") {
    return (
      <button
        onClick={() => useOffice.getState().openPanel("compose")}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 animate-bounce rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-2xl"
      >
        Tekan <kbd className="mx-1 rounded bg-white/25 px-1.5 py-0.5">E</kbd> untuk membuka Meja Tugas
      </button>
    );
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-slate-900/75 px-4 py-1.5 text-xs text-white shadow md:block">
      <b>WASD</b> jalan · <b>Shift</b> lari · klik lantai untuk berjalan · seret untuk memutar kamera · klik tokoh untuk profil · tangga di ujung timur
    </div>
  );
}
