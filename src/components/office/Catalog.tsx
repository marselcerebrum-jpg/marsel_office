"use client";

import { useMemo, useState } from "react";
import { DIVISION_LABELS_ID, REGION_LABELS, type Agent, type Division, type Region, type Runbook } from "@/lib/types";
import { hasActiveFilters, matchesFilters } from "@/lib/filter";
import { useOffice } from "./store";

export function Catalog({
  agents,
  divisions,
  runbooks,
  onPick,
}: {
  agents: Agent[];
  divisions: Division[];
  runbooks: Runbook[];
  onPick: (id: string) => void;
}) {
  const filters = useOffice((s) => s.filters);
  const setFilters = useOffice((s) => s.setFilters);
  const open = useOffice((s) => s.catalogOpen);
  const setOpen = useOffice((s) => s.setCatalogOpen);
  const selectedId = useOffice((s) => s.selectedId);
  const [showFilters, setShowFilters] = useState(false);

  const results = useMemo(() => agents.filter((a) => matchesFilters(a, filters)), [agents, filters]);
  const divisionById = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions]);
  const active = hasActiveFilters(filters);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-3 top-20 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow-md hover:bg-white"
      >
        🔎 Cari agen
      </button>
    );
  }

  return (
    <aside className="absolute bottom-3 left-3 top-20 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white/95 shadow-xl backdrop-blur">
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Direktori Agen</h2>
          <button onClick={() => setOpen(false)} className="rounded px-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup katalog">
            ✕
          </button>
        </div>
        <input
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Cari: SEO, TikTok, keamanan, laporan…"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <button onClick={() => setShowFilters((v) => !v)} className="font-semibold text-amber-700 hover:underline">
            {showFilters ? "Sembunyikan filter" : "Filter lanjutan"}
          </button>
          <span className="text-slate-500">
            {results.length} dari {agents.length}
            {active && (
              <button
                className="ml-2 font-semibold text-slate-700 hover:underline"
                onClick={() => setFilters({ query: "", divisions: new Set(), regions: new Set(), onlyIssues: false, runbook: null })}
              >
                Reset
              </button>
            )}
          </span>
        </div>

        {showFilters && (
          <div className="mt-2 max-h-64 space-y-3 overflow-y-auto pr-1 text-xs">
            <div>
              <div className="mb-1 font-semibold text-slate-600">Divisi</div>
              <div className="flex flex-wrap gap-1">
                {divisions.map((d) => {
                  const on = filters.divisions.has(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => setFilters({ divisions: toggle(filters.divisions, d.id) })}
                      className="rounded-full border px-2 py-0.5"
                      style={on ? { background: d.color, borderColor: d.color, color: "white" } : { borderColor: "#CBD5E1" }}
                    >
                      {DIVISION_LABELS_ID[d.id] ?? d.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-600">Wilayah / pasar</div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(REGION_LABELS) as Region[]).map((r) => {
                  const on = filters.regions.has(r);
                  return (
                    <button
                      key={r}
                      onClick={() => setFilters({ regions: toggle(filters.regions, r) })}
                      className={`rounded-full border px-2 py-0.5 ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300"}`}
                    >
                      {REGION_LABELS[r]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-600">Tim runbook NEXUS</div>
              <select
                value={filters.runbook ?? ""}
                onChange={(e) => setFilters({ runbook: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1"
              >
                <option value="">Semua</option>
                {runbooks.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={filters.onlyIssues} onChange={(e) => setFilters({ onlyIssues: e.target.checked })} />
              Hanya agen dengan catatan kualitas
            </label>
          </div>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {results.map((a) => {
          const d = divisionById.get(a.division);
          const issue = a.flags.find((f) => f.severity !== "info");
          return (
            <li key={a.id}>
              <button
                onClick={() => onPick(a.id)}
                className={`flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-amber-50 ${selectedId === a.id ? "bg-amber-100" : ""}`}
              >
                <span className="mt-0.5 text-xl leading-none">{a.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold">{a.name}</span>
                    {issue && <span title={issue.label}>⚠️</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{a.roleId}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: d?.color }} />
                    <span className="text-slate-500">{DIVISION_LABELS_ID[a.division] ?? d?.label}</span>
                    {a.regions
                      .filter((r) => r !== "global")
                      .map((r) => (
                        <span key={r} className="rounded bg-slate-100 px-1 text-slate-600">
                          {REGION_LABELS[r]}
                        </span>
                      ))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Tidak ada agen yang cocok.</li>}
      </ul>
    </aside>
  );
}
