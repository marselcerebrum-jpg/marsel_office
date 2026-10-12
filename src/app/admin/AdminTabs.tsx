"use client";

import { useState } from "react";
import { IntegrationsAdmin } from "./IntegrationsAdmin";
import { UsersAdmin } from "./UsersAdmin";

export function AdminTabs({ meId }: { meId: number }) {
  const [tab, setTab] = useState<"tim" | "integrasi">("tim");
  return (
    <>
      <nav className="mt-6 flex gap-1">
        {(
          [
            ["tim", "👥 Tim"],
            ["integrasi", "⚙️ Integrasi aplikasi internal"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "tim" ? <UsersAdmin meId={meId} /> : <IntegrationsAdmin />}
    </>
  );
}
