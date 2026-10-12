import { apiUser, handle } from "@/lib/auth";
import { downloadResponse, renderPackage } from "@/lib/deliverable-files";
import { getTask } from "@/lib/tasks";
import { listDeliverables } from "@/lib/work";

/** Unduh semua hasil kerja sebuah tugas dalam satu .zip. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/tasks/[id]/package">) => {
  await apiUser();
  const task = getTask(Number((await ctx.params).id));
  if (!task) return Response.json({ error: "Tugas tidak ditemukan" }, { status: 404 });
  const items = listDeliverables(task.id);
  if (!items.some((d) => d.content.trim())) return Response.json({ error: "Belum ada hasil kerja" }, { status: 400 });
  const pkg = await renderPackage(task.title, items);
  return downloadResponse(pkg.data, pkg.name, "application/zip");
});
