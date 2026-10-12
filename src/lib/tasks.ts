import "server-only";
import { db } from "./db";

export type TaskStatus = "routing" | "gathering" | "meeting" | "review" | "approved" | "rejected" | "failed";

export type Task = {
  id: number;
  userId: number;
  userName: string;
  title: string;
  brief: string;
  status: TaskStatus;
  routing: "auto" | "manual";
  provider: string;
  model: string;
  participants: string[];
  result: string | null;
  reviewNote: string | null;
  revision: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskMessage = {
  id: number;
  taskId: number;
  revision: number;
  kind: "brief" | "agent" | "summary" | "review" | "system";
  agentId: string | null;
  content: string;
  createdAt: string;
};

type TaskRow = {
  id: number; user_id: number; user_name: string; title: string; brief: string; status: TaskStatus;
  routing: "auto" | "manual"; provider: string; model: string; participants: string; result: string | null;
  review_note: string | null; revision: number; error: string | null; created_at: string; updated_at: string;
};

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  title: r.title,
  brief: r.brief,
  status: r.status,
  routing: r.routing,
  provider: r.provider,
  model: r.model,
  participants: JSON.parse(r.participants),
  result: r.result,
  reviewNote: r.review_note,
  revision: r.revision,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT = "SELECT t.*, u.name AS user_name FROM tasks t JOIN users u ON u.id = t.user_id";

export function listTasks(limit = 50): Task[] {
  return (db().prepare(`${SELECT} ORDER BY t.id DESC LIMIT ?`).all(limit) as TaskRow[]).map(toTask);
}

export function getTask(id: number): Task | null {
  const r = db().prepare(`${SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  return r ? toTask(r) : null;
}

export function createTask(t: {
  userId: number; title: string; brief: string; routing: "auto" | "manual"; provider: string; model: string; participants: string[];
}): number {
  const r = db()
    .prepare(
      "INSERT INTO tasks (user_id, title, brief, status, routing, provider, model, participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(t.userId, t.title, t.brief, t.routing === "auto" ? "routing" : "gathering", t.routing, t.provider, t.model, JSON.stringify(t.participants));
  return Number(r.lastInsertRowid);
}

export function updateTask(id: number, patch: Partial<Pick<Task, "status" | "participants" | "result" | "reviewNote" | "revision" | "error">>) {
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  const map: Record<string, string> = { reviewNote: "review_note" };
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${map[k] ?? k} = ?`);
    vals.push(k === "participants" ? JSON.stringify(v) : (v as string | number | null));
  }
  cols.push("updated_at = datetime('now')");
  db().prepare(`UPDATE tasks SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
}

export function listMessages(taskId: number): TaskMessage[] {
  return (
    db().prepare("SELECT * FROM task_messages WHERE task_id = ? ORDER BY id").all(taskId) as {
      id: number; task_id: number; revision: number; kind: TaskMessage["kind"]; agent_id: string | null; content: string; created_at: string;
    }[]
  ).map((r) => ({ id: r.id, taskId: r.task_id, revision: r.revision, kind: r.kind, agentId: r.agent_id, content: r.content, createdAt: r.created_at }));
}

export function addMessage(m: { taskId: number; revision: number; kind: TaskMessage["kind"]; agentId: string | null; content: string }): number {
  const r = db()
    .prepare("INSERT INTO task_messages (task_id, revision, kind, agent_id, content) VALUES (?, ?, ?, ?, ?)")
    .run(m.taskId, m.revision, m.kind, m.agentId, m.content);
  return Number(r.lastInsertRowid);
}

export function setMessageContent(id: number, content: string) {
  db().prepare("UPDATE task_messages SET content = ? WHERE id = ?").run(content, id);
}
