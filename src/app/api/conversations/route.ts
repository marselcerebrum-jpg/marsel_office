import { apiUser, handle } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  const user = await apiUser();
  const agentId = new URL(req.url).searchParams.get("agentId");
  const rows = agentId
    ? db()
        .prepare("SELECT id, agent_id AS agentId, provider, model, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? AND agent_id = ? ORDER BY updated_at DESC")
        .all(user.id, agentId)
    : db()
        .prepare("SELECT id, agent_id AS agentId, provider, model, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100")
        .all(user.id);
  return Response.json({ conversations: rows });
});
