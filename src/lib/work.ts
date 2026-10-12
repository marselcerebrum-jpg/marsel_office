import "server-only";
import { db } from "./db";

/* ------------------------------------------------------------- hasil kerja */

export type DeliverableType = "document" | "report" | "content" | "spreadsheet" | "code";
export type DeliverableStatus = "pending" | "working" | "qa" | "revising" | "done" | "failed";

export type Deliverable = {
  id: number;
  taskId: number;
  key: string;
  title: string;
  type: DeliverableType;
  assignee: string;
  instructions: string;
  dependsOn: string[];
  status: DeliverableStatus;
  content: string;
  qaNotes: string | null;
  attempts: number;
  revisionNote: string | null;
  position: number;
  updatedAt: string;
};

type DRow = {
  id: number; task_id: number; item_key: string; title: string; type: DeliverableType; assignee: string; instructions: string;
  depends_on: string; status: DeliverableStatus; content: string; qa_notes: string | null; attempts: number;
  revision_note: string | null; position: number; updated_at: string;
};

const toD = (r: DRow): Deliverable => ({
  id: r.id,
  taskId: r.task_id,
  key: r.item_key,
  title: r.title,
  type: r.type,
  assignee: r.assignee,
  instructions: r.instructions,
  dependsOn: JSON.parse(r.depends_on),
  status: r.status,
  content: r.content,
  qaNotes: r.qa_notes,
  attempts: r.attempts,
  revisionNote: r.revision_note,
  position: r.position,
  updatedAt: r.updated_at,
});

export function listDeliverables(taskId: number): Deliverable[] {
  return (db().prepare("SELECT * FROM deliverables WHERE task_id = ? ORDER BY position, id").all(taskId) as DRow[]).map(toD);
}

export function getDeliverable(id: number): Deliverable | null {
  const r = db().prepare("SELECT * FROM deliverables WHERE id = ?").get(id) as DRow | undefined;
  return r ? toD(r) : null;
}

export function addDeliverable(d: Omit<Deliverable, "id" | "status" | "content" | "qaNotes" | "attempts" | "revisionNote" | "updatedAt">): number {
  const r = db()
    .prepare(
      "INSERT INTO deliverables (task_id, item_key, title, type, assignee, instructions, depends_on, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(d.taskId, d.key, d.title, d.type, d.assignee, d.instructions, JSON.stringify(d.dependsOn), d.position);
  return Number(r.lastInsertRowid);
}

export function updateDeliverable(id: number, patch: Partial<Pick<Deliverable, "status" | "content" | "qaNotes" | "attempts" | "revisionNote">>) {
  const map: Record<string, string> = { qaNotes: "qa_notes", revisionNote: "revision_note" };
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${map[k] ?? k} = ?`);
    vals.push(v as string | number | null);
  }
  cols.push("updated_at = datetime('now')");
  db().prepare(`UPDATE deliverables SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
}

export function clearDeliverables(taskId: number) {
  db().prepare("DELETE FROM deliverables WHERE task_id = ?").run(taskId);
}

/* --------------------------------------------------------------- integrasi */

export type Integration = {
  id: number;
  slug: string;
  name: string;
  description: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  inputExample: string;
  autoApprove: boolean;
  active: boolean;
};

type IRow = {
  id: number; slug: string; name: string; description: string; url: string; method: string; headers: string;
  input_example: string; auto_approve: number; active: number;
};

const toI = (r: IRow): Integration => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  url: r.url,
  method: r.method,
  headers: JSON.parse(r.headers || "{}"),
  inputExample: r.input_example,
  autoApprove: !!r.auto_approve,
  active: !!r.active,
});

export function listIntegrations(activeOnly = false): Integration[] {
  const rows = db()
    .prepare(`SELECT * FROM integrations ${activeOnly ? "WHERE active = 1" : ""} ORDER BY name`)
    .all() as IRow[];
  return rows.map(toI);
}

export function getIntegration(slug: string): Integration | null {
  const r = db().prepare("SELECT * FROM integrations WHERE slug = ?").get(slug) as IRow | undefined;
  return r ? toI(r) : null;
}

export function saveIntegration(i: Omit<Integration, "id">, id?: number) {
  const vals = [i.slug, i.name, i.description, i.url, i.method, JSON.stringify(i.headers), i.inputExample, i.autoApprove ? 1 : 0, i.active ? 1 : 0];
  if (id) {
    db()
      .prepare("UPDATE integrations SET slug=?, name=?, description=?, url=?, method=?, headers=?, input_example=?, auto_approve=?, active=? WHERE id = ?")
      .run(...vals, id);
    return id;
  }
  const r = db()
    .prepare("INSERT INTO integrations (slug, name, description, url, method, headers, input_example, auto_approve, active) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(...vals);
  return Number(r.lastInsertRowid);
}

export function deleteIntegration(id: number) {
  db().prepare("DELETE FROM integrations WHERE id = ?").run(id);
}

/* ----------------------------------------------------------- permintaan aksi */

export type ActionStatus = "pending" | "approved" | "rejected" | "done" | "failed";

export type ActionRequest = {
  id: number;
  taskId: number;
  deliverableId: number | null;
  agentId: string;
  integration: string;
  input: unknown;
  reason: string | null;
  status: ActionStatus;
  result: string | null;
  createdAt: string;
};

type ARow = {
  id: number; task_id: number; deliverable_id: number | null; agent_id: string; integration: string; input: string;
  reason: string | null; status: ActionStatus; result: string | null; created_at: string;
};

const toA = (r: ARow): ActionRequest => ({
  id: r.id,
  taskId: r.task_id,
  deliverableId: r.deliverable_id,
  agentId: r.agent_id,
  integration: r.integration,
  input: JSON.parse(r.input),
  reason: r.reason,
  status: r.status,
  result: r.result,
  createdAt: r.created_at,
});

export function listActions(taskId: number): ActionRequest[] {
  return (db().prepare("SELECT * FROM actions WHERE task_id = ? ORDER BY id").all(taskId) as ARow[]).map(toA);
}

export function getAction(id: number): ActionRequest | null {
  const r = db().prepare("SELECT * FROM actions WHERE id = ?").get(id) as ARow | undefined;
  return r ? toA(r) : null;
}

export function addAction(a: { taskId: number; deliverableId: number | null; agentId: string; integration: string; input: unknown; reason: string | null }) {
  const r = db()
    .prepare("INSERT INTO actions (task_id, deliverable_id, agent_id, integration, input, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .run(a.taskId, a.deliverableId, a.agentId, a.integration, JSON.stringify(a.input ?? {}), a.reason);
  return Number(r.lastInsertRowid);
}

export function updateAction(id: number, patch: { status: ActionStatus; result?: string | null; decidedBy?: number | null }) {
  db()
    .prepare("UPDATE actions SET status = ?, result = COALESCE(?, result), decided_by = COALESCE(?, decided_by), updated_at = datetime('now') WHERE id = ?")
    .run(patch.status, patch.result ?? null, patch.decidedBy ?? null, id);
}

/** Jalankan aksi yang sudah disetujui: kirim ke webhook aplikasi internal. */
export async function runAction(a: ActionRequest, ctx: { taskTitle: string }): Promise<{ ok: boolean; result: string }> {
  const integ = getIntegration(a.integration);
  if (!integ || !integ.active) return { ok: false, result: `Integrasi "${a.integration}" tidak ditemukan atau nonaktif` };
  try {
    const res = await fetch(integ.url, {
      method: integ.method,
      headers: { "Content-Type": "application/json", ...integ.headers },
      body: integ.method === "GET" ? undefined : JSON.stringify({ input: a.input, reason: a.reason, agent: a.agentId, task: { id: a.taskId, title: ctx.taskTitle } }),
      signal: AbortSignal.timeout(30000),
    });
    const text = (await res.text()).slice(0, 4000);
    return { ok: res.ok, result: `HTTP ${res.status}${text ? `\n${text}` : ""}` };
  } catch (e) {
    return { ok: false, result: e instanceof Error ? e.message : String(e) };
  }
}
