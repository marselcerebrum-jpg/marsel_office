import { apiUser, handle } from "@/lib/auth";
import { downloadResponse, renderDeliverable, type Format } from "@/lib/deliverable-files";
import { getDeliverable } from "@/lib/work";

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/deliverables/[id]/download">) => {
  await apiUser();
  const d = getDeliverable(Number((await ctx.params).id));
  if (!d) return Response.json({ error: "Hasil tidak ditemukan" }, { status: 404 });
  const format = (new URL(req.url).searchParams.get("format") ?? "md") as Format;
  if (!["md", "docx", "xlsx", "zip"].includes(format)) return Response.json({ error: "Format tidak dikenal" }, { status: 400 });
  try {
    const f = await renderDeliverable(d, format);
    return downloadResponse(f.data, f.name, f.mime);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
