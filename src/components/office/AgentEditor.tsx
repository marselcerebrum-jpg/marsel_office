"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "@/lib/types";
import { api } from "./useTasks";

/** Editor prompt agen khusus (mis. Produk Cerebrum). Hanya untuk admin. */
export function AgentEditor({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: agent.name,
    app: agent.app ?? "",
    role: agent.roleId ?? "",
    description: agent.description,
    vibe: agent.vibe,
    emoji: agent.emoji,
    body: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ body: string }>(`/api/agents/${agent.id}`)
      .then((d) => {
        setForm((f) => ({ ...f, body: d.body }));
        setLoaded(true);
      })
      .catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [agent.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const remaining = (form.body.match(/\[ISI[:\]]/g) ?? []).length + (/\[ISI/.test(form.description) ? 1 : 0);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/agents/${agent.id}`, { method: "PUT", json: form });
      setMsg({ ok: true, text: "Tersimpan. Agen langsung memakai prompt baru di chat dan rapat berikutnya." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm("Kembalikan agen ini ke template awal? Isian Anda akan dihapus.")) return;
    setBusy(true);
    try {
      const d = await api<{ body: string }>(`/api/agents/${agent.id}`, { method: "DELETE" });
      setForm((f) => ({ ...f, body: d.body }));
      setMsg({ ok: true, text: "Dikembalikan ke template awal." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  // Portal ke <body> agar editor tampil layar penuh, tidak terjepit di dalam panel profil.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Edit prompt ${agent.name}`}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <span className="text-2xl">{form.emoji}</span>
          <div className="flex-1">
            <h2 className="font-bold">Edit prompt · {agent.name}</h2>
            <p className="text-xs text-slate-500">
              Ganti setiap <code className="rounded bg-amber-100 px-1">[ISI: …]</code> dengan informasi produk yang sebenarnya.{" "}
              {remaining > 0 ? (
                <b className="text-amber-700">{remaining} isian tersisa.</b>
              ) : (
                <b className="text-green-700">Semua isian sudah terisi.</b>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-2.5 py-1 text-slate-500 hover:bg-slate-100" aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[260px_1fr]">
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="font-semibold">Nama agen</span>
              <input value={form.name} onChange={set("name")} className={input} />
            </label>
            {agent.app !== null && agent.app !== undefined && (
              <label className="block">
                <span className="font-semibold">Nama aplikasi</span>
                <input value={form.app} onChange={set("app")} className={input} placeholder="mis. Cerebrum CBT" />
              </label>
            )}
            <label className="block">
              <span className="font-semibold">Peran (badge)</span>
              <input value={form.role} onChange={set("role")} className={input} />
            </label>
            <label className="block">
              <span className="font-semibold">Deskripsi singkat</span>
              <textarea value={form.description} onChange={set("description")} rows={4} className={input} />
              <span className="text-[11px] text-slate-500">Dipakai pemimpin rapat untuk memutuskan kapan agen ini dipanggil. Tulis fungsi dan penggunanya dengan jelas.</span>
            </label>
            <label className="block">
              <span className="font-semibold">Vibe / slogan</span>
              <input value={form.vibe} onChange={set("vibe")} className={input} />
            </label>
            <label className="block">
              <span className="font-semibold">Emoji</span>
              <input value={form.emoji} onChange={set("emoji")} className={`${input} w-20 text-center text-lg`} maxLength={8} />
            </label>
          </div>

          <div className="flex min-h-[420px] flex-col">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold">Prompt lengkap (markdown)</span>
              <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
                <button onClick={() => setPreview(false)} className={`px-3 py-1 ${!preview ? "bg-slate-800 text-white" : ""}`}>
                  Tulis
                </button>
                <button onClick={() => setPreview(true)} className={`px-3 py-1 ${preview ? "bg-slate-800 text-white" : ""}`}>
                  Pratinjau
                </button>
              </div>
            </div>
            {preview ? (
              <article className="prompt-md flex-1 overflow-y-auto rounded-lg border border-slate-200 p-4 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.body}</ReactMarkdown>
              </article>
            ) : (
              <textarea
                value={loaded ? form.body : "Memuat…"}
                onChange={set("body")}
                disabled={!loaded}
                spellCheck={false}
                className="flex-1 resize-none rounded-lg border border-slate-300 p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
          {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
          <button onClick={reset} disabled={busy} className="ml-auto rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Kembalikan ke template
          </button>
          <button onClick={save} disabled={busy || !loaded} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
