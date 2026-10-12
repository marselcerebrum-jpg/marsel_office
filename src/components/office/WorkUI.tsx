"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "@/lib/types";
import { useOffice, type ActionRequest, type Deliverable, type TaskDetail } from "./store";
import { api, useDriveEnabled } from "./useTasks";

export const D_STATUS: Record<Deliverable["status"], { label: string; cls: string }> = {
  pending: { label: "Menunggu", cls: "bg-slate-100 text-slate-600" },
  working: { label: "✍️ Dikerjakan", cls: "bg-violet-100 text-violet-800" },
  qa: { label: "🔍 Diperiksa QA", cls: "bg-sky-100 text-sky-800" },
  revising: { label: "🔧 Diperbaiki", cls: "bg-amber-100 text-amber-900" },
  done: { label: "✓ Selesai", cls: "bg-green-100 text-green-800" },
  failed: { label: "Gagal", cls: "bg-red-100 text-red-800" },
};

const TYPE_ICON: Record<Deliverable["type"], string> = {
  document: "📄 Dokumen",
  report: "📊 Laporan",
  content: "✍️ Konten",
  spreadsheet: "📈 Spreadsheet",
  code: "💻 Kode",
};

const hasTable = (md: string) => /^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(md) || /```csv/i.test(md);
const hasCode = (md: string) => /^#{2,4}\s*(File|Berkas)\s*:/im.test(md);

/* ------------------------------------------------------------ tab hasil */

export function DeliverablesTab({ agents, canReview }: { agents: Agent[]; canReview: boolean }) {
  const task = useOffice((s) => s.task)!;
  const deliverables = useOffice((s) => s.deliverables);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const [open, setOpen] = useState<number | null>(null);
  const work = deliverables.filter((d) => d.key !== "final");
  const final = deliverables.find((d) => d.key === "final");
  const done = work.filter((d) => d.status === "done").length;
  const opened = deliverables.find((d) => d.id === open) ?? null;

  if (!deliverables.length) {
    return (
      <p className="text-slate-500">
        {task.status === "planning" ? "Pemimpin rapat sedang membagi pekerjaan ke para spesialis…" : "Belum ada hasil kerja."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold">
            {done} dari {work.length} pekerjaan selesai
          </span>
          {deliverables.some((d) => d.content && d.status === "done") && (
            <a href={`/api/tasks/${task.id}/package`} className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white hover:bg-slate-900">
              ⬇️ Unduh semua (.zip)
            </a>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all" style={{ width: `${work.length ? (done / work.length) * 100 : 0}%` }} />
        </div>
      </div>

      {final && (final.status !== "pending" || final.content) && (
        <button onClick={() => setOpen(final.id)} className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-left hover:bg-amber-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-amber-900">⭐ Laporan Akhir</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${D_STATUS[final.status].cls}`}>{D_STATUS[final.status].label}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-amber-900/80">{final.content.replace(/[#*|`>-]/g, " ").slice(0, 220) || "Sedang disusun…"}</p>
        </button>
      )}

      <ul className="space-y-2">
        {work.map((d) => {
          const a = byId.get(d.assignee);
          return (
            <li key={d.id}>
              <button onClick={() => setOpen(d.id)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-slate-300 hover:bg-slate-50">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-xl">{a?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-snug">{d.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${D_STATUS[d.status].cls}`}>{D_STATUS[d.status].label}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {TYPE_ICON[d.type]} · {a?.name ?? d.assignee}
                      {d.attempts > 0 && ` · perbaikan ke-${d.attempts}`}
                    </div>
                    {d.qaNotes && d.status === "done" && <div className="mt-1 line-clamp-1 text-[11px] text-green-700">QA: {d.qaNotes}</div>}
                    {d.revisionNote && d.status !== "done" && <div className="mt-1 line-clamp-1 text-[11px] text-amber-700">Revisi: {d.revisionNote}</div>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {opened && <DeliverableViewer d={opened} agent={byId.get(opened.assignee)} task={task} canReview={canReview} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ------------------------------------------------------- penampil hasil */

function DeliverableViewer({ d, agent, task, canReview, onClose }: { d: Deliverable; agent?: Agent; task: TaskDetail; canReview: boolean; onClose: () => void }) {
  const drive = useDriveEnabled();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = d.status === "working" || d.status === "revising";
  const finished = d.status === "done" && !!d.content;
  const formats: [string, string][] = [
    ["md", ".md"],
    ["docx", ".docx"],
    ...(hasTable(d.content) ? ([["xlsx", ".xlsx"]] as [string, string][]) : []),
    ...(hasCode(d.content) ? ([["zip", ".zip (kode)"]] as [string, string][]) : []),
  ];

  const saveDrive = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ link: string }>(`/api/deliverables/${d.id}/drive`, { method: "POST" });
      setMsg({ ok: true, text: "Tersimpan di Google Drive.", link: r.link });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/deliverables/${d.id}/revise`, { method: "POST", json: { note } });
      setNote("");
      setMsg({ ok: true, text: `${agent?.name ?? "Agen"} sedang memperbaiki hasil ini.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={d.title}>
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3">
          <span className="text-2xl">{d.key === "final" ? "⭐" : agent?.emoji}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold leading-snug">{d.title}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${D_STATUS[d.status].cls}`}>{D_STATUS[d.status].label}</span>
              <span>{TYPE_ICON[d.type]}</span>
              <span>· {agent?.name ?? d.assignee}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full px-2.5 py-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {d.key !== "final" && (
            <details className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold">Instruksi pekerjaan</summary>
              <p className="mt-1 whitespace-pre-wrap">{d.instructions}</p>
            </details>
          )}
          {d.qaNotes && (
            <div className={`mb-3 rounded-lg p-3 text-xs ${d.status === "done" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
              <b>Catatan QA (Reality Checker):</b> {d.qaNotes}
            </div>
          )}
          {d.content ? (
            <article className="prompt-md text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.content}</ReactMarkdown>
              {writing && <span className="inline-block h-4 w-1.5 animate-pulse bg-amber-500 align-middle" />}
            </article>
          ) : (
            <p className="text-slate-500">{d.status === "pending" ? "Menunggu giliran dikerjakan…" : "Sedang menulis…"}</p>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-200 px-5 py-3">
          {finished && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Unduh:</span>
              {formats.map(([f, label]) => (
                <a key={f} href={`/api/deliverables/${d.id}/download?format=${f}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                  {label}
                </a>
              ))}
              <button
                onClick={saveDrive}
                disabled={!drive || busy}
                title={drive ? "Simpan ke folder Google Drive tim" : "Google Drive belum dikonfigurasi di server"}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                ☁️ Simpan ke Drive
              </button>
              <button onClick={() => navigator.clipboard.writeText(d.content)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                📋 Salin
              </button>
            </div>
          )}
          {finished && canReview && d.key !== "final" && ["delivered", "done"].includes(task.status) && (
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Minta ${agent?.name ?? "agen"} memperbaiki… (mis. tambahkan kolom PIC)`}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
              />
              <button onClick={revise} disabled={busy || note.trim().length < 5} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40">
                ✏️ Minta revisi
              </button>
            </div>
          )}
          {msg && (
            <div className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>
              {msg.text}{" "}
              {msg.link && (
                <a href={msg.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                  Buka di Drive
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------- tab aksi */

const A_STATUS: Record<ActionRequest["status"], { label: string; cls: string }> = {
  pending: { label: "Menunggu persetujuan", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "Dijalankan…", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "Ditolak", cls: "bg-slate-200 text-slate-600" },
  done: { label: "Berhasil", cls: "bg-green-100 text-green-800" },
  failed: { label: "Gagal", cls: "bg-red-100 text-red-800" },
};

export function ActionsTab({ agents, canReview }: { agents: Agent[]; canReview: boolean }) {
  const actions = useOffice((s) => s.actions);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: number, decision: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      const r = await api<{ action?: ActionRequest }>(`/api/actions/${id}`, { method: "POST", json: { decision } });
      if (r.action) useOffice.getState().upsertAction(r.action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!actions.length) {
    return (
      <p className="text-slate-500">
        Belum ada permintaan aksi. Agen bisa meminta aksi ke aplikasi internal yang didaftarkan admin di menu <b>Kelola tim → Integrasi</b>.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {error && <li className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</li>}
      {actions.map((a) => (
        <li key={a.id} className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">
                ⚙️ {a.integration} <span className="font-normal text-slate-500">· diminta {byId.get(a.agentId)?.name ?? a.agentId}</span>
              </div>
              {a.reason && <div className="text-xs text-slate-600">{a.reason}</div>}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${A_STATUS[a.status].cls}`}>{A_STATUS[a.status].label}</span>
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">{JSON.stringify(a.input, null, 2)}</pre>
          {a.result && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">{a.result}</pre>}
          {canReview && (a.status === "pending" || a.status === "failed") && (
            <div className="mt-2 flex gap-2">
              <button disabled={busy === a.id} onClick={() => decide(a.id, "approve")} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
                {a.status === "failed" ? "🔁 Coba lagi" : "✅ Setujui & jalankan"}
              </button>
              {a.status === "pending" && (
                <button disabled={busy === a.id} onClick={() => decide(a.id, "reject")} className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  Tolak
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
