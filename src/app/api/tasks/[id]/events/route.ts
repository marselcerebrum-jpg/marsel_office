import { apiUser, handle } from "@/lib/auth";
import { liveOf, type MeetingEvent } from "@/lib/meeting";
import { getTask, listMessages } from "@/lib/tasks";
import { listActions, listDeliverables } from "@/lib/work";

/** Server-Sent Events: snapshot awal lalu kejadian rapat secara langsung. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/tasks/[id]/events">) => {
  await apiUser();
  const id = Number((await ctx.params).id);
  const task = getTask(id);
  if (!task) return Response.json({ error: "Tugas tidak ditemukan" }, { status: 404 });

  const live = liveOf(id);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      // Pesan yang sedang ditulis diambil dari memori agar tampil lengkap sejak awal.
      const messages = listMessages(id).map((m) => (live.partial.has(m.id) ? { ...m, content: live.partial.get(m.id)!, streaming: true } : m));
      const deliverables = listDeliverables(id).map((d) => (live.partialD.has(d.id) ? { ...d, content: live.partialD.get(d.id)! } : d));
      send({ type: "snapshot", task: getTask(id), messages, deliverables, actions: listActions(id) });
      const onEvent = (e: MeetingEvent) => send(e);
      live.emitter.on("event", onEvent);
      const ping = setInterval(() => send({ type: "ping" }), 20000);
      cleanup = () => {
        clearInterval(ping);
        live.emitter.off("event", onEvent);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
