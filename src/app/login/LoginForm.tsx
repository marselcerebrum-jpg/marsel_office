"use client";

import { useState } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setError(d.error ?? "Gagal masuk");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-sm">
        <span className="font-semibold">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
      </label>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button
        disabled={busy || !username || !password}
        className="w-full rounded-xl bg-amber-500 py-3 font-bold text-white shadow-lg hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Masuk…" : "Masuk ke kantor"}
      </button>
    </form>
  );
}
