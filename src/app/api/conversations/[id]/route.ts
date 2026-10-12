import { apiUser, handle } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/conversations/[id]">) => {
  const user = await apiUser();
  const id = Number((await ctx.params).id);
  const conv = db()
    .prepare("SELECT id, agent_id AS agentId, provider, model, title FROM conversations WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!conv) return Response.json({ error: "Percakapan tidak ditemukan" }, { status: 404 });
  const messages = db().prepare("SELECT id, role, content, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY id").all(id);
  return Response.json({ conversation: conv, messages });
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/conversations/[id]">) => {
  const user = await apiUser();
  const id = Number((await ctx.params).id);
  db().prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(id, user.id);
  return Response.json({ ok: true });
});
