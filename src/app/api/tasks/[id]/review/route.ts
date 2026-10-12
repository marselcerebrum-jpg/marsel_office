import { apiUser, handle } from "@/lib/auth";
import { liveOf, startMeeting } from "@/lib/meeting";
import { addMessage, getTask, updateTask } from "@/lib/tasks";

/** Keputusan pemberi tugas: setujui, minta revisi (rapat lagi), tolak, atau ulangi rapat yang gagal. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/tasks/[id]/review">) => {
  const user = await apiUser();
  const id = Number((await ctx.params).id);
  const task = getTask(id);
  if (!task) return Response.json({ error: "Tugas tidak ditemukan" }, { status: 404 });
  if (task.userId !== user.id && user.role !== "admin") {
    return Response.json({ error: "Hanya pemberi tugas atau admin yang bisa mereview" }, { status: 403 });
  }
  const { action, note } = (await req.json()) as { action?: string; note?: string };

  if (action === "retry") {
    if (task.status !== "failed") return Response.json({ error: "Rapat tidak dalam status gagal" }, { status: 400 });
    updateTask(id, { status: task.participants.length > 1 ? "gathering" : "routing", error: null });
    startMeeting(id, null);
    return Response.json({ ok: true });
  }

  if (task.status !== "review") return Response.json({ error: "Tugas belum siap direview" }, { status: 400 });
  if (liveOf(id).running) return Response.json({ error: "Rapat masih berjalan" }, { status: 409 });

  if (action === "approve" || action === "reject") {
    const status = action === "approve" ? "approved" : "rejected";
    if (note?.trim()) addMessage({ taskId: id, revision: task.revision, kind: "system", agentId: null, content: note.trim() });
    updateTask(id, { status, reviewNote: note?.trim() || null });
    liveOf(id).emitter.emit("event", { type: "status", status });
    return Response.json({ ok: true });
  }

  if (action === "revise") {
    if (!note || note.trim().length < 5) return Response.json({ error: "Tulis catatan revisi untuk tim" }, { status: 400 });
    const revision = task.revision + 1;
    addMessage({ taskId: id, revision, kind: "review", agentId: null, content: note.trim() });
    updateTask(id, { status: "gathering", reviewNote: note.trim(), revision });
    startMeeting(id, null);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Aksi tidak dikenal" }, { status: 400 });
});
