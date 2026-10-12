import type { Agent } from "./types";
import type { Filters } from "@/components/office/store";

export function matchesFilters(a: Agent, f: Filters): boolean {
  if (f.divisions.size && !f.divisions.has(a.division)) return false;
  if (f.regions.size && !a.regions.some((r) => f.regions.has(r))) return false;
  if (f.onlyIssues && !a.flags.some((fl) => fl.severity !== "info")) return false;
  if (f.runbook && !a.runbooks.some((r) => r.slug === f.runbook)) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  // Vibe sengaja tidak ikut dicari: isinya gaya bahasa, bukan keahlian.
  const hay = [a.name, a.description, a.descriptionId, a.roleId, a.division, a.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Cocokkan dari awal kata agar "seo" tidak ikut menangkap "seolah".
  return q.split(/\s+/).every((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}`, "u").test(hay));
}

export function hasActiveFilters(f: Filters): boolean {
  return !!(f.query.trim() || f.divisions.size || f.regions.size || f.onlyIssues || f.runbook);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
