import { getAgent, getAgentBody } from "@/lib/agents-server";

export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[id]">) {
  const { id } = await ctx.params;
  const agent = getAgent(id);
  const body = agent && getAgentBody(id);
  if (!agent || body === undefined) return Response.json({ error: "Agen tidak ditemukan" }, { status: 404 });
  return Response.json({ id, body });
}
