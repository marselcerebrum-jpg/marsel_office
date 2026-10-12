"use client";

import { useCallback, useEffect, useState } from "react";

type I = {
  id: number;
  slug: string;
  name: string;
  description: string;
  url: string;
  method: string;
  headers: string[];
  inputExample: string;
  autoApprove: boolean;
  active: boolean;
};

const EMPTY = { slug: "", name: "", description: "", url: "", method: "POST", headers: "", inputExample: '{\n  "contoh": "nilai"\n}', autoApprove: false, active: true };

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
  return d;
}

export function IntegrationsAdmin() {
  const [list, setList] = useState<I[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<I | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => call<{ integrations: I[] }>("/api/admin/integrations", "GET").then((d) => setList(d.integrations)), []);
  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [load]);

  const edit = (i: I | null) => {
    setEditing(i);
    setForm(i ? { ...i, headers: "" } : EMPTY);
    setMsg(null);
  };

  const save = async () => {
    try {
      if (editing) await call(`/api/admin/integrations/${editing.id}`, "PUT", form);
      else await call("/api/admin/integrations", "POST", form);
      setMsg({ ok: true, text: editing ? "Integrasi diperbarui." : "Integrasi ditambahkan." });
      edit(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const remove = async (i: I) => {
    if (!confirm(`Hapus integrasi "${i.name}"?`)) return;
    await call(`/api/admin/integrations/${i.id}`, "DELETE").catch((e) => setMsg({ ok: false, text: (e as Error).message }));
    await load();
  };

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow">
        <b className="text-slate-900">Cara kerja:</b> daftarkan aplikasi internal sebagai webhook. Saat mengerjakan tugas, agen bisa <i>meminta</i> aksi ke aplikasi ini (mis. membuat
        jadwal, mengirim broadcast, memperbarui data). Permintaan muncul di tab <b>Aksi</b> pada tugas dan baru dijalankan setelah disetujui, kecuali Anda mengaktifkan
        &quot;setujui otomatis&quot;. Aplikasi menerima <code className="rounded bg-slate-100 px-1">POST</code> berisi{" "}
        <code className="rounded bg-slate-100 px-1">{`{ input, reason, agent, task: { id, title } }`}</code>.
      </div>

      <div className="grid gap-3 rounded-2xl bg-white p-5 shadow sm:grid-cols-2">
        <h2 className="font-bold sm:col-span-2">{editing ? `Ubah integrasi: ${editing.name}` : "Tambah integrasi"}</h2>
        <label className="text-sm">
          <span className="font-semibold">Nama</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. CRM Cerebrum" className={input} />
        </label>
        <label className="text-sm">
          <span className="font-semibold">Slug (dipakai agen)</span>
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mis. crm-cerebrum" className={input} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold">Deskripsi untuk agen</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Apa yang dilakukan endpoint ini dan kapan agen boleh memakainya. mis. Membuat jadwal broadcast WhatsApp ke segmen pelanggan."
            className={input}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold">URL webhook</span>
          <div className="flex gap-2">
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="mt-1 rounded-lg border border-slate-300 px-2 text-sm">
              {["POST", "PUT", "PATCH", "GET"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://app-internal.cerebrum.id/api/agent-hook" className={input} />
          </div>
        </label>
        <label className="text-sm">
          <span className="font-semibold">Header (satu per baris)</span>
          <textarea
            value={form.headers}
            onChange={(e) => setForm({ ...form, headers: e.target.value })}
            rows={3}
            placeholder={editing ? `Kosongkan untuk memakai header lama (${editing.headers.join(", ") || "tidak ada"})` : "Authorization: Bearer xxxxx"}
            className={`${input} font-mono text-xs`}
          />
          <span className="text-[11px] text-slate-500">Disimpan di server dan tidak pernah ditampilkan lagi.</span>
        </label>
        <label className="text-sm">
          <span className="font-semibold">Contoh input (JSON)</span>
          <textarea value={form.inputExample} onChange={(e) => setForm({ ...form, inputExample: e.target.value })} rows={3} className={`${input} font-mono text-xs`} />
          <span className="text-[11px] text-slate-500">Agen mengikuti bentuk ini saat meminta aksi.</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} />
          Setujui otomatis (aksi langsung dijalankan tanpa menunggu persetujuan)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Aktif
        </label>
        <div className="flex gap-2 sm:col-span-2 sm:justify-end">
          {editing && (
            <button onClick={() => edit(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Batal
            </button>
          )}
          <button onClick={save} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600">
            {editing ? "Simpan perubahan" : "Tambah integrasi"}
          </button>
        </div>
      </div>

      {msg && <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}

      <ul className="space-y-2">
        {list.length === 0 && <li className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow">Belum ada integrasi.</li>}
        {list.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-white p-4 shadow">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                ⚙️ {i.name} <code className="ml-1 rounded bg-slate-100 px-1 text-xs">{i.slug}</code>
                {!i.active && <span className="ml-2 rounded-full bg-slate-200 px-2 text-[11px]">nonaktif</span>}
                {i.autoApprove && <span className="ml-2 rounded-full bg-amber-100 px-2 text-[11px] text-amber-900">setujui otomatis</span>}
              </div>
              <div className="text-sm text-slate-600">{i.description}</div>
              <div className="truncate text-xs text-slate-400">
                {i.method} {i.url}
              </div>
            </div>
            <button onClick={() => edit(i)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
              Ubah
            </button>
            <button onClick={() => remove(i)} className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">
              Hapus
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
