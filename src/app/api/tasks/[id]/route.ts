import { apiUser, handle } from "@/lib/auth";
import { getTask, listMessages } from "@/lib/tasks";
import { listActions, listDeliverables } from "@/lib/work";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/tasks/[id]">) => {
  await apiUser();
  const task = getTask(Number((await ctx.params).id));
  if (!task) return Response.json({ error: "Tugas tidak ditemukan" }, { status: 404 });
  return Response.json({ task, messages: listMessages(task.id), deliverables: listDeliverables(task.id), actions: listActions(task.id) });
});
