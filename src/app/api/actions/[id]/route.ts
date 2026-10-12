import { apiUser, handle } from "@/lib/auth";
import { executeAction } from "@/lib/execution";
import { emit } from "@/lib/meeting";
import { getTask } from "@/lib/tasks";
import { getAction, updateAction } from "@/lib/work";

/** Setujui (lalu jalankan) atau tolak permintaan aksi agen ke aplikasi internal. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/actions/[id]">) => {
  const user = await apiUser();
  const a = getAction(Number((await ctx.params).id));
  if (!a) return Response.json({ error: "Permintaan aksi tidak ditemukan" }, { status: 404 });
  const task = getTask(a.taskId)!;
  if (task.userId !== user.id && user.role !== "admin") return Response.json({ error: "Hanya pemberi tugas atau admin" }, { status: 403 });
  if (a.status !== "pending" && a.status !== "failed") return Response.json({ error: "Aksi sudah diputuskan" }, { status: 400 });
  const { decision } = (await req.json()) as { decision?: string };
  if (decision === "reject") {
    updateAction(a.id, { status: "rejected", decidedBy: user.id });
    emit(a.taskId, { type: "action", a: getAction(a.id) });
    return Response.json({ ok: true });
  }
  if (decision !== "approve") return Response.json({ error: "Keputusan tidak dikenal" }, { status: 400 });
  await executeAction(a.id, user.id);
  return Response.json({ action: getAction(a.id) });
});
