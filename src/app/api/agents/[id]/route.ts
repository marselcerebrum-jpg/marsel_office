import { apiUser, handle } from "@/lib/auth";
import { getAgent, getAgentBody, getBaseAgentBody, resetOverride, saveOverride } from "@/lib/agents-server";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[id]">) => {
  await apiUser();
  const { id } = await ctx.params;
  const agent = getAgent(id);
  const body = agent && getAgentBody(id);
  if (!agent || body === undefined) return Response.json({ error: "Agen tidak ditemukan" }, { status: 404 });
  return Response.json({ id, body });
});

/** Admin mengisi/mengubah prompt agen khusus (mis. Produk Cerebrum). */
export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/agents/[id]">) => {
  const user = await apiUser({ admin: true });
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "Agen tidak ditemukan" }, { status: 404 });
  if (!agent.custom) return Response.json({ error: "Hanya agen khusus Agent Desk yang bisa diedit" }, { status: 403 });

  const b = (await req.json()) as Partial<Record<"name" | "role" | "app" | "description" | "vibe" | "emoji" | "body", string>>;
  const clean = (v: string | undefined, max: number) => {
    const s = (v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  const name = clean(b.name, 80);
  const body = clean(b.body, 60000);
  if (!name) return Response.json({ error: "Nama wajib diisi" }, { status: 400 });
  if (!body || body.length < 50) return Response.json({ error: "Prompt terlalu pendek" }, { status: 400 });

  saveOverride(id, user.id, {
    name,
    role: clean(b.role, 80),
    app: clean(b.app, 80),
    description: clean(b.description, 600),
    vibe: clean(b.vibe, 200),
    emoji: clean(b.emoji, 8),
    body,
  });
  return Response.json({ ok: true });
});

/** Kembalikan ke template awal. */
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[id]">) => {
  await apiUser({ admin: true });
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent?.custom) return Response.json({ error: "Hanya agen khusus yang bisa direset" }, { status: 403 });
  resetOverride(id);
  return Response.json({ ok: true, body: getBaseAgentBody(id) });
});
