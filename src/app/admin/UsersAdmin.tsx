"use client";

import { useCallback, useEffect, useState } from "react";

type U = { id: number; username: string; name: string; role: "admin" | "member"; active: number; createdAt: string };

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
  return d;
}

export function UsersAdmin({ meId }: { meId: number }) {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "member" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => call<{ users: U[] }>("/api/admin/users", "GET").then((d) => setUsers(d.users)), []);
  useEffect(() => {
    load().catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await call("/api/admin/users", "POST", form);
            setForm({ username: "", name: "", password: "", role: "member" });
          }, `Akun ${form.username} dibuat.`);
        }}
        className="grid gap-3 rounded-2xl bg-white p-5 shadow sm:grid-cols-5"
      >
        <h2 className="font-bold sm:col-span-5">Tambah anggota</h2>
        <input
          required
          placeholder="Nama lengkap"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          required
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          minLength={8}
          placeholder="Password (min. 8)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="member">Anggota</option>
          <option value="admin">Admin</option>
        </select>
        <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 sm:col-span-5 sm:justify-self-end">Buat akun</button>
      </form>

      {msg && <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold">
                  {u.name} {u.id === meId && <span className="text-xs font-normal text-slate-400">(Anda)</span>}
                </td>
                <td className="px-4 py-3">{u.username}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={u.id === meId}
                    onChange={(e) => run(() => call(`/api/admin/users/${u.id}`, "PATCH", { role: e.target.value }), "Peran diperbarui.")}
                    className="rounded border border-slate-300 px-2 py-1"
                  >
                    <option value="member">Anggota</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>
                    {u.active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      const pw = prompt(`Password baru untuk ${u.username} (min. 8 karakter):`);
                      if (pw) run(() => call(`/api/admin/users/${u.id}`, "PATCH", { password: pw }), "Password direset.");
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Reset password
                  </button>
                  {u.id !== meId && (
                    <button
                      onClick={() =>
                        run(() => call(`/api/admin/users/${u.id}`, "PATCH", { active: !u.active }), u.active ? "Akun dinonaktifkan." : "Akun diaktifkan.")
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      {u.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
