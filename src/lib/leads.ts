import "server-only";
import fs from "node:fs";
import path from "node:path";

export type LeadsConfig = { chair: string; leads: Record<string, string> };

let cache: LeadsConfig | null = null;

export function getLeads(): LeadsConfig {
  cache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "leads.json"), "utf8")) as LeadsConfig;
  return cache;
}
