import "server-only";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import type { Agent, Division, QualityFlag, Runbook } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

let baseAgents: Agent[] | null = null;
let baseBodies: Record<string, string> | null = null;

export type AgentOverride = {
  agentId: string;
  name: string | null;
  role: string | null;
  app: string | null;
  description: string | null;
  vibe: string | null;
  emoji: string | null;
  body: string | null;
  updatedAt: string;
};

function overrides(): Map<string, AgentOverride> {
  const rows = db()
    .prepare(
      "SELECT agent_id AS agentId, name, role, app, description, vibe, emoji, body, updated_at AS updatedAt FROM agent_overrides",
    )
    .all() as AgentOverride[];
  return new Map(rows.map((r) => [r.agentId, { ...r }]));
}

/** Judul level 1–2 di luar blok kode (untuk ringkasan isi prompt). */
function sectionsOf(body: string) {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^ {0,3}(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const h = line.match(/^#{1,2}\s+(.*)$/);
      if (h) out.push(h[1].trim());
    }
  }
  return out.slice(0, 40);
}

const unfilledCount = (body: string) => (body.match(/\[ISI[:\]]/g) ?? []).length;

/** Daftar agen; agen khusus digabung dengan isian dari database. */
export function getAgents(): Agent[] {
  baseAgents ??= readJson<Agent[]>("agents.json");
  const ov = overrides();
  return baseAgents.map((a) => {
    if (!a.custom) return a;
    const o = ov.get(a.id);
    const body = o?.body ?? getBaseBody(a.id) ?? "";
    const missing = unfilledCount(body);
    const flags: QualityFlag[] = missing
      ? [{ code: "unfilled", label: `Prompt belum lengkap (${missing} isian [ISI] tersisa)`, severity: "warn" }]
      : [];
    const description = o?.description ?? a.description;
    return {
      ...a,
      name: o?.name ?? a.name,
      roleId: o?.role ?? a.roleId,
      app: o?.app ?? a.app,
      description,
      descriptionId: description,
      vibe: o?.vibe ?? a.vibe,
      vibeId: o?.vibe ?? a.vibeId,
      emoji: o?.emoji ?? a.emoji,
      words: body.split(/\s+/).filter(Boolean).length,
      sections: sectionsOf(body),
      flags,
    };
  });
}

export function getAgent(id: string): Agent | undefined {
  return getAgents().find((a) => a.id === id);
}

function getBaseBody(id: string): string | undefined {
  baseBodies ??= readJson<Record<string, string>>("agent-bodies.json");
  return baseBodies[id];
}

export function getAgentBody(id: string): string | undefined {
  const base = getBaseBody(id);
  const row = db().prepare("SELECT body FROM agent_overrides WHERE agent_id = ?").get(id) as { body: string | null } | undefined;
  return row?.body ?? base;
}

export function getBaseAgentBody(id: string) {
  return getBaseBody(id);
}

export function saveOverride(id: string, userId: number, o: Omit<AgentOverride, "agentId" | "updatedAt">) {
  db()
    .prepare(
      `INSERT INTO agent_overrides (agent_id, name, role, app, description, vibe, emoji, body, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(agent_id) DO UPDATE SET name = excluded.name, role = excluded.role, app = excluded.app,
         description = excluded.description, vibe = excluded.vibe, emoji = excluded.emoji, body = excluded.body,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .run(id, o.name, o.role, o.app, o.description, o.vibe, o.emoji, o.body, userId);
}

export function resetOverride(id: string) {
  db().prepare("DELETE FROM agent_overrides WHERE agent_id = ?").run(id);
}

export function getDivisions(): Division[] {
  return readJson<Division[]>("divisions.json");
}

export function getRunbooks(): Runbook[] {
  return readJson<Runbook[]>("runbooks.json");
}

/** Product Specialist aplikasi Cerebrum (anggota divisi cerebrum-product selain lead). */
export function getAppAgents(leadId: string | undefined): Agent[] {
  return getAgents().filter((a) => a.division === "cerebrum-product" && a.id !== leadId);
}
