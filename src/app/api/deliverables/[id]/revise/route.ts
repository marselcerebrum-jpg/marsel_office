import { apiUser, handle } from "@/lib/auth";
import { startExecution } from "@/lib/execution";
import { liveOf } from "@/lib/meeting";
import { getTask, updateTask } from "@/lib/tasks";
import { getDeliverable, updateDeliverable } from "@/lib/work";

/** Minta agen penanggung jawab memperbaiki satu hasil kerja; Laporan Akhir disusun ulang. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/deliverables/[id]/revise">) => {
  const user = await apiUser();
  const d = getDeliverable(Number((await ctx.params).id));
  if (!d) return Response.json({ error: "Hasil tidak ditemukan" }, { status: 404 });
  const task = getTask(d.taskId)!;
  if (task.userId !== user.id && user.role !== "admin") return Response.json({ error: "Hanya pemberi tugas atau admin" }, { status: 403 });
  if (!["delivered", "done"].includes(task.status)) return Response.json({ error: "Tunggu sampai semua hasil selesai dikerjakan" }, { status: 400 });
  if (liveOf(task.id).running) return Response.json({ error: "Tim masih bekerja" }, { status: 409 });
  if (d.key === "final") return Response.json({ error: "Laporan Akhir disusun otomatis dari hasil lain" }, { status: 400 });
  const { note } = (await req.json()) as { note?: string };
  if (!note || note.trim().length < 5) return Response.json({ error: "Tulis catatan revisi" }, { status: 400 });
  updateDeliverable(d.id, { status: "pending", revisionNote: note.trim(), attempts: 0 });
  updateTask(task.id, { status: "executing" });
  startExecution(task.id, { reviseId: d.id });
  return Response.json({ ok: true });
});
