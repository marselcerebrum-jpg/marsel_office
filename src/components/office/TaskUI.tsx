"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DIVISION_LABELS_ID, type Agent, type Division } from "@/lib/types";
import type { Building } from "./building";
import { useOffice, type TaskMessage } from "./store";
import { api, STATUS_LABEL, STATUS_STYLE, useModelChoice, useProviders, type ProviderInfo, type TaskSummary } from "./useTasks";

export type Leads = { chair: string; leads: Record<string, string> };
const MAX_PARTICIPANTS = 8;

/* ------------------------------------------------------------ pemilih model */

export function ModelSelect({
  providers,
  value,
  onChange,
}: {
  providers: ProviderInfo[];
  value: { provider: string; model: string } | null;
  onChange: (v: { provider: string; model: string }) => void;
}) {
  return (
    <select
      value={value ? `${value.provider}::${value.model}` : ""}
      onChange={(e) => {
        const [provider, model] = e.target.value.split("::");
        onChange({ provider, model });
      }}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
    >
      {providers.map((p) => (
        <optgroup key={p.id} label={p.label}>
          {p.models.map((m) => (
            <option key={m} value={`${p.id}::${m}`}>
              {m}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function NoProviderNote() {
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      Belum ada model AI yang aktif. Isi <code>ANTHROPIC_API_KEY</code> dan/atau <code>OPENAI_API_KEY</code> di file <code>.env</code> server, lalu
      mulai ulang aplikasi. Untuk mencoba alurnya tanpa API, set <code>LLM_MOCK=1</code>.
    </div>
  );
}

/* --------------------------------------------------------------- composer */

export function TaskComposer({
  agents,
  divisions,
  leads,
  onCreated,
}: {
  agents: Agent[];
  divisions: Division[];
  leads: Leads;
  onCreated: (id: number) => void;
}) {
  const close = () => useOffice.getState().openPanel(null);
  const providers = useProviders();
  const [model, setModel] = useModelChoice(providers);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [routing, setRouting] = useState<"auto" | "manual">("auto");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<string[]>(() => useOffice.getState().composeSeed);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const total = 1 + (routing === "manual" ? picked.size : 0) + extras.length;
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return agents
      .filter((a) => !extras.includes(a.id) && a.id !== leads.chair)
      .filter((a) => `${a.name} ${a.roleId ?? ""} ${a.descriptionId ?? ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, agents, extras, leads.chair]);

  const submit = async () => {
    if (!model) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ id: number }>("/api/tasks", {
        method: "POST",
        json: { title, brief, routing, divisions: [...picked], agents: extras, provider: model.provider, model: model.model },
      });
      onCreated(d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chair = byId.get(leads.chair);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm" onClick={close}>
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kirim tugas"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-amber-100 to-orange-50 px-5 py-4">
          <span className="text-3xl">📥</span>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Meja Tugas</h2>
            <p className="text-xs text-slate-600">
              Tugas dibahas para lead di Ruang Rapat dan dipimpin {chair?.name}. Keputusan akhir tetap di tangan Anda.
            </p>
          </div>
          <button onClick={close} className="rounded-full px-2.5 py-1 text-slate-500 hover:bg-white" aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <label className="block">
            <span className="font-semibold">Judul tugas</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mis. Strategi promosi kelas CPNS 2026"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="font-semibold">Detail & konteks</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={6}
              placeholder="Jelaskan tujuan, target, batasan (budget, waktu), dan hasil yang Anda harapkan."
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          <div>
            <span className="font-semibold">Siapa yang ikut rapat?</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(
                [
                  ["auto", "🤖 Otomatis", `${chair?.name ?? "Pemimpin rapat"} memilih 2–4 divisi paling relevan`],
                  ["manual", "🎯 Saya pilih sendiri", "Tentukan divisi (lead-nya hadir) atau agen tertentu"],
                ] as const
              ).map(([id, label, desc]) => (
                <button
                  key={id}
                  onClick={() => setRouting(id)}
                  className={`rounded-xl border-2 p-3 text-left ${routing === id ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-slate-500">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {routing === "manual" && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Divisi (lead yang akan datang)</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {divisions
                  .filter((d) => leads.leads[d.id])
                  .map((d) => {
                    const lead = byId.get(leads.leads[d.id]);
                    const on = picked.has(d.id);
                    const full = !on && total >= MAX_PARTICIPANTS;
                    return (
                      <button
                        key={d.id}
                        disabled={full}
                        onClick={() => {
                          const n = new Set(picked);
                          if (on) n.delete(d.id);
                          else n.add(d.id);
                          setPicked(n);
                        }}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left disabled:opacity-40 ${on ? "border-transparent text-white" : "border-slate-200 hover:bg-slate-50"}`}
                        style={on ? { background: d.color } : undefined}
                      >
                        <span className="text-lg">{lead?.emoji}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{DIVISION_LABELS_ID[d.id] ?? d.label}</span>
                          <span className={`block truncate text-[11px] ${on ? "text-white/85" : "text-slate-500"}`}>{lead?.name}</span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Undang agen tertentu (opsional)</div>
            <div className="flex flex-wrap gap-1">
              {extras.map((id) => (
                <span key={id} className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-white">
                  {byId.get(id)?.emoji} {byId.get(id)?.name}
                  <button onClick={() => setExtras(extras.filter((x) => x !== id))} aria-label="Hapus">
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={total >= MAX_PARTICIPANTS}
              placeholder={total >= MAX_PARTICIPANTS ? `Maksimal ${MAX_PARTICIPANTS} peserta` : "Cari agen, mis. TikTok, SEO, copywriter…"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 outline-none focus:border-amber-500"
            />
            {suggestions.length > 0 && (
              <ul className="mt-1 rounded-lg border border-slate-200">
                {suggestions.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => {
                        setExtras([...extras, a.id]);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-amber-50"
                    >
                      <span>{a.emoji}</span>
                      <span className="font-medium">{a.name}</span>
                      <span className="truncate text-xs text-slate-500">{a.roleId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 text-[11px] text-slate-500">
              Peserta: {total} dari maks. {MAX_PARTICIPANTS} (termasuk pemimpin rapat). Makin banyak peserta, makin banyak token terpakai.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Model AI</span>
            {providers === null ? (
              <span className="text-slate-500">Memuat…</span>
            ) : providers.length === 0 ? null : (
              <ModelSelect providers={providers} value={model} onChange={setModel} />
            )}
          </div>
          {providers?.length === 0 && <NoProviderNote />}
          {error && <div className="rounded-lg bg-red-50 p-2 text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={close} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={busy || !model || title.trim().length < 3 || brief.trim().length < 10 || (routing === "manual" && picked.size === 0 && extras.length === 0)}
            className="rounded-lg bg-amber-500 px-5 py-2 font-bold text-white shadow hover:bg-amber-600 disabled:opacity-40"
          >
            {busy ? "Mengirim…" : "Kirim & panggil rapat"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- panel rapat */

const STEPS = ["routing", "gathering", "meeting", "review"] as const;

export function TaskPanel({ agents, meId, isAdmin, onGoMeeting, onBack }: { agents: Agent[]; meId: number; isAdmin: boolean; onGoMeeting: () => void; onBack: () => void }) {
  const task = useOffice((s) => s.task);
  const messages = useOffice((s) => s.messages);
  const speakingId = useOffice((s) => s.speakingId);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);

  if (!task) return null;
  const canReview = task.userId === meId || isAdmin;
  const stepIdx = STEPS.indexOf(task.status as (typeof STEPS)[number]);

  const act = async (action: "approve" | "revise" | "reject" | "retry") => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/${task.id}/review`, { method: "POST", json: { action, note } });
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const byRevision = new Map<number, TaskMessage[]>();
  for (const m of messages) byRevision.set(m.revision, [...(byRevision.get(m.revision) ?? []), m]);

  return (
    <aside className="absolute bottom-3 right-3 top-20 z-20 flex w-[min(500px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="border-b border-slate-200 bg-gradient-to-r from-brand-navy to-[#0B3F5E] px-4 py-3 text-white">
        <div className="flex items-start gap-2">
          <button onClick={onBack} className="mt-0.5 rounded px-1.5 text-white/70 hover:bg-white/10" aria-label="Kembali ke daftar tugas">
            ←
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
              {task.revision > 1 && <span className="text-[11px] text-white/70">Revisi {task.revision}</span>}
            </div>
            <h2 className="mt-1 text-base font-bold leading-snug">{task.title}</h2>
            <div className="text-[11px] text-white/60">
              Dari {task.userName} · {task.model}
            </div>
          </div>
          <button onClick={() => useOffice.getState().openPanel(null)} className="rounded-full px-2 text-white/70 hover:bg-white/10" aria-label="Tutup">
            ✕
          </button>
        </div>
        {/* Linimasa status */}
        <div className="mt-3 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-1">
              <div className={`h-1.5 rounded-full ${i <= stepIdx || ["approved", "rejected"].includes(task.status) ? "bg-amber-400" : "bg-white/20"}`} />
              <span className="text-[10px] text-white/70">{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2">
        {task.participants.map((id) => {
          const a = byId.get(id);
          if (!a) return null;
          const on = id === speakingId;
          return (
            <div
              key={id}
              title={`${a.name} — ${a.roleId}`}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-emerald-500 bg-emerald-50 font-semibold" : "border-slate-200"}`}
            >
              <span>{a.emoji}</span>
              <span className="max-w-[110px] truncate">{a.name}</span>
              {on && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
            </div>
          );
        })}
        {["routing", "gathering", "meeting"].includes(task.status) && (
          <button onClick={onGoMeeting} className="ml-auto shrink-0 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600">
            👀 Tonton di ruang rapat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <button onClick={() => setShowBrief((v) => !v)} className="text-xs font-semibold text-amber-700 hover:underline">
          {showBrief ? "Sembunyikan detail tugas" : "Lihat detail tugas"}
        </button>
        {showBrief && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">{task.brief}</p>}

        {[...byRevision.entries()].map(([rev, list]) => (
          <div key={rev} className="space-y-3">
            {rev > 1 && <div className="text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">— Revisi {rev} —</div>}
            {list
              .filter((m) => m.kind !== "brief")
              .map((m) => (
                <Message key={m.id} m={m} agent={m.agentId ? byId.get(m.agentId) : undefined} />
              ))}
          </div>
        ))}
        {task.status === "routing" && <p className="text-slate-500">Pemimpin rapat sedang memilih divisi yang relevan…</p>}
        {task.status === "gathering" && <p className="text-slate-500">Para lead sedang berjalan ke ruang rapat…</p>}
        {task.error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{task.error}</div>}
      </div>

      {canReview && task.status === "review" && (
        <div className="space-y-2 border-t border-slate-200 bg-amber-50 px-4 py-3">
          <div className="text-sm font-bold text-amber-900">Keputusan Anda</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Catatan untuk tim (wajib bila minta revisi)…"
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          {error && <div className="text-xs text-red-700">{error}</div>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => act("approve")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
              ✅ Setujui
            </button>
            <button
              disabled={busy || note.trim().length < 5}
              onClick={() => act("revise")}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              title="Tim akan rapat lagi membahas catatan Anda"
            >
              ✏️ Minta revisi
            </button>
            <button disabled={busy} onClick={() => act("reject")} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-50">
              ✖ Tolak
            </button>
          </div>
        </div>
      )}
      {canReview && task.status === "failed" && (
        <div className="border-t border-slate-200 px-4 py-3">
          <button disabled={busy} onClick={() => act("retry")} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50">
            🔁 Ulangi rapat
          </button>
        </div>
      )}
      {["approved", "rejected"].includes(task.status) && (
        <div className={`border-t px-4 py-3 text-sm font-semibold ${task.status === "approved" ? "bg-green-50 text-green-800" : "bg-slate-50 text-slate-600"}`}>
          {task.status === "approved" ? "✅ Usulan disetujui." : "✖ Usulan ditolak."}
          {task.reviewNote && <span className="font-normal"> Catatan: {task.reviewNote}</span>}
        </div>
      )}
    </aside>
  );
}

function Message({ m, agent }: { m: TaskMessage; agent?: Agent }) {
  if (m.kind === "review") {
    return (
      <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-3">
        <div className="text-xs font-bold text-amber-900">📝 Catatan revisi dari pemberi tugas</div>
        <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
      </div>
    );
  }
  if (m.kind === "system") {
    return <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Catatan keputusan: {m.content}</div>;
  }
  const summary = m.kind === "summary";
  return (
    <div className={summary ? "rounded-xl border-2 border-amber-400 bg-white p-3 shadow-sm" : "flex gap-2"}>
      {summary ? (
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">⭐ Usulan akhir · {agent?.name}</div>
      ) : (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: `${agent?.color ?? "#999"}33` }}>
          {agent?.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {!summary && (
          <div className="text-xs font-bold">
            {agent?.name} <span className="font-normal text-slate-500">· {agent?.roleId}</span>
          </div>
        )}
        <div className="prompt-md text-[13px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
          {m.streaming && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-amber-500 align-middle" />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ daftar tugas */

export function TaskList({ tasks, meId, onOpen }: { tasks: TaskSummary[]; meId: number; onOpen: (id: number) => void }) {
  return (
    <aside className="absolute bottom-3 right-3 top-20 z-20 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-bold">📋 Papan Tugas</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => useOffice.getState().openPanel("compose")} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600">
            + Tugas baru
          </button>
          <button onClick={() => useOffice.getState().openPanel(null)} className="rounded-full px-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            ✕
          </button>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {tasks.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Belum ada tugas. Kirim tugas pertama Anda di Meja Tugas.</li>}
        {tasks.map((t) => (
          <li key={t.id}>
            <button onClick={() => onOpen(t.id)} className="w-full rounded-xl p-3 text-left hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                {t.status === "review" && t.userId === meId && <span className="text-[11px] font-bold text-amber-700">Perlu keputusan Anda</span>}
              </div>
              <div className="mt-1 font-semibold">{t.title}</div>
              <div className="text-xs text-slate-500">
                {t.userName} · {new Date(t.createdAt.replace(" ", "T") + "Z").toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                {t.revision > 1 && ` · revisi ${t.revision}`}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export type { Building };
