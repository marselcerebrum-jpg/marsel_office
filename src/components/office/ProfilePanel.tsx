"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DIVISION_LABELS_ID, REGION_LABELS, type Agent, type Division } from "@/lib/types";
import { lookFor } from "./character";
import { Rig } from "./Rig";
import { ChatPanel } from "./ChatPanel";
import { AgentEditor } from "./AgentEditor";

type Tab = "ringkasan" | "prompt" | "kualitas";

export function ProfilePanel({
  agent,
  divisions,
  onClose,
  onInvite,
  isAdmin,
}: {
  agent: Agent;
  divisions: Division[];
  onClose: () => void;
  onInvite: (agentId: string) => void;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [chatting, setChatting] = useState(false);
  const [editing, setEditing] = useState(false);
  const division = divisions.find((d) => d.id === agent.division);

  return (
    <aside className="absolute bottom-3 right-3 top-20 z-20 flex w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="relative shrink-0" style={{ background: `linear-gradient(135deg, ${agent.color}33, ${division?.color ?? agent.color}55)` }}>
        <button
          onClick={onClose}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/80 px-2.5 py-1 text-sm text-slate-600 hover:bg-white"
          aria-label="Tutup profil"
        >
          ✕
        </button>
        <div className="flex items-end gap-3 px-4 pt-3">
          <div className="h-36 w-28 shrink-0">
            <Portrait agent={agent} />
          </div>
          <div className="min-w-0 pb-3">
            <div className="text-3xl leading-none">{agent.emoji}</div>
            <h2 className="mt-1 text-lg font-bold leading-tight">{agent.name}</h2>
            <div className="text-sm font-medium text-slate-700">{agent.roleId}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: division?.color }}>
                {DIVISION_LABELS_ID[agent.division] ?? division?.label}
              </span>
              {agent.subgroup && <span className="rounded-full bg-white/80 px-2 py-0.5">{agent.subgroup}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-b border-slate-200 px-4 py-2">
        <button
          onClick={() => setChatting((v) => !v)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${chatting ? "bg-slate-200 text-slate-800" : "bg-amber-500 text-white hover:bg-amber-600"}`}
        >
          {chatting ? "📇 Lihat profil" : "💬 Ajak ngobrol"}
        </button>
        <button onClick={() => onInvite(agent.id)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          📥 Undang ke rapat
        </button>
        {agent.custom && isAdmin && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" title="Isi / ubah prompt agen ini">
            ✏️ Edit
          </button>
        )}
      </div>
      {agent.custom && agent.flags.some((f) => f.code === "unfilled") && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          ⚠️ Prompt agen ini masih berupa kerangka.{isAdmin ? " Klik ✏️ Edit untuk mengisinya." : " Minta admin untuk mengisinya."}
        </div>
      )}
      {editing && <AgentEditor agent={agent} onClose={() => setEditing(false)} />}

      {chatting ? (
        <ChatPanel agent={agent} onBack={() => setChatting(false)} />
      ) : (
        <>
          <nav className="flex shrink-0 gap-1 border-b border-slate-200 px-3 pt-2 text-sm">
            {(
              [
                ["ringkasan", "Ringkasan"],
                ["prompt", "Prompt lengkap"],
                ["kualitas", "Kualitas & label"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-t-lg px-3 py-1.5 font-semibold ${tab === id ? "bg-amber-100 text-amber-900" : "text-slate-500 hover:text-slate-800"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        {tab === "ringkasan" && <Summary agent={agent} />}
        {tab === "prompt" && <PromptView key={agent.id} agent={agent} />}
        {tab === "kualitas" && <Quality agent={agent} />}
          </div>
        </>
      )}
    </aside>
  );
}

function Summary({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-4">
      {agent.vibeId && <p className="rounded-lg bg-amber-50 px-3 py-2 italic text-amber-900">“{agent.vibeId}”</p>}
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Keahlian</h3>
        <p className="leading-relaxed">{agent.descriptionId ?? agent.description}</p>
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Deskripsi asli (English)</summary>
          <p className="mt-1">{agent.description}</p>
          {agent.vibe && <p className="mt-1 italic">“{agent.vibe}”</p>}
        </details>
      </section>
      {agent.runbooks.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Anggota tim runbook NEXUS</h3>
          <ul className="space-y-1">
            {agent.runbooks.map((r) => (
              <li key={r.slug + r.group} className="rounded-lg bg-slate-50 px-3 py-1.5">
                <b>{r.title}</b> <span className="text-slate-500">· {r.group}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Isi prompt</h3>
        <div className="flex flex-wrap gap-1">
          {agent.sections.map((s, i) => (
            <span key={i} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {s}
            </span>
          ))}
        </div>
      </section>
      {agent.services.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Butuh layanan eksternal</h3>
          <ul className="list-disc pl-5">
            {agent.services.map((s) => (
              <li key={s.name}>
                {s.name} {s.tier && <span className="text-slate-500">({s.tier})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PromptView({ agent }: { agent: Agent }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/agents/${agent.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { body: string }) => alive && setBody(d.body))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [agent.id]);

  if (error) return <p className="text-red-600">Gagal memuat prompt: {error}</p>;
  if (body === null) return <p className="text-slate-500">Memuat prompt…</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {agent.words.toLocaleString("id-ID")} kata · <code>{agent.sourcePath}</code>
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(body).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-lg border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Tersalin ✓" : "Salin prompt"}
        </button>
      </div>
      <article className="prompt-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </article>
    </div>
  );
}

function Quality({ agent }: { agent: Agent }) {
  const sev = { error: "bg-red-100 text-red-800", warn: "bg-amber-100 text-amber-900", info: "bg-slate-100 text-slate-700" };
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Wilayah / pasar</h3>
        <div className="flex gap-1">
          {agent.regions.map((r) => (
            <span key={r} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-white">
              {REGION_LABELS[r]}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Catatan kualitas</h3>
        {agent.flags.length === 0 ? (
          <p className="text-emerald-700">Tidak ada catatan, struktur prompt lengkap.</p>
        ) : (
          <ul className="space-y-1">
            {agent.flags.map((f) => (
              <li key={f.code} className={`rounded-lg px-3 py-1.5 ${sev[f.severity]}`}>
                {f.label}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Panjang prompt" value={`${agent.words.toLocaleString("id-ID")} kata`} />
        <Stat label="Jumlah bagian" value={String(agent.sections.length)} />
        <Stat label="Tools bawaan" value={agent.tools.length ? agent.tools.join(", ") : "—"} />
        <Stat label="File sumber" value={agent.sourcePath} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-slate-500">{label}</div>
      <div className="break-words font-semibold">{value}</div>
    </div>
  );
}

/* -------------------------------------------------- potret tokoh berputar */

export function Portrait({ agent }: { agent: Agent }) {
  return (
    <Canvas camera={{ position: [0, 1.25, 3.2], fov: 30 }} dpr={[1, 2]} gl={{ alpha: true }}>
      <hemisphereLight args={["#FFFFFF", "#AAB4C3", 1.3]} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <Spinner agent={agent} />
    </Canvas>
  );
}

function Spinner({ agent }: { agent: Agent }) {
  const ref = useRef<THREE.Group>(null);
  const [look] = useState(() => lookFor(agent.id, agent.division, agent.color));
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.5;
  });
  return (
    <group ref={ref} position={[0, -0.9, 0]}>
      <Rig look={look} mode="stand" castShadow={false} />
    </group>
  );
}
