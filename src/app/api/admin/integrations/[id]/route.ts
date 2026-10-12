import { apiUser, handle } from "@/lib/auth";
import { deleteIntegration, listIntegrations, saveIntegration } from "@/lib/work";
import { parseIntegration } from "../parse";

export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/admin/integrations/[id]">) => {
  await apiUser({ admin: true });
  const id = Number((await ctx.params).id);
  const current = listIntegrations().find((i) => i.id === id);
  if (!current) return Response.json({ error: "Integrasi tidak ditemukan" }, { status: 404 });
  // Kolom header dikosongkan = pakai header lama (token tidak perlu diketik ulang).
  const parsed = parseIntegration(await req.json(), current.headers);
  if ("error" in parsed) return Response.json(parsed, { status: 400 });
  saveIntegration(parsed, id);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/admin/integrations/[id]">) => {
  await apiUser({ admin: true });
  deleteIntegration(Number((await ctx.params).id));
  return Response.json({ ok: true });
});
