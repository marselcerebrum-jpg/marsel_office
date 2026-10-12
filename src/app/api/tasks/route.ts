import { apiUser, handle } from "@/lib/auth";
import { getAgent, getAppAgents } from "@/lib/agents-server";
import { getLeads } from "@/lib/leads";
import { assertModel } from "@/lib/llm";
import { CEREBRUM, MAX_PARTICIPANTS, participantsFor, reconcileStale, startMeeting } from "@/lib/meeting";
import { addMessage, createTask, listTasks } from "@/lib/tasks";

export const GET = handle(async () => {
  await apiUser();
  const tasks = listTasks();
  reconcileStale(tasks);
  return Response.json({ tasks });
});

export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const b = (await req.json()) as {
    title?: string; brief?: string; routing?: "auto" | "manual"; divisions?: string[]; agents?: string[]; provider?: string; model?: string;
  };
  const title = b.title?.trim() ?? "";
  const brief = b.brief?.trim() ?? "";
  if (title.length < 3) return Response.json({ error: "Judul tugas terlalu pendek" }, { status: 400 });
  if (brief.length < 10) return Response.json({ error: "Jelaskan tugasnya lebih detail" }, { status: 400 });
  if (!b.provider || !b.model) return Response.json({ error: "Pilih model AI" }, { status: 400 });
  await assertModel(b.provider, b.model);

  const { chair, leads } = getLeads();
  const divisions = (b.divisions ?? []).filter((d) => leads[d]);
  const extras = (b.agents ?? []).filter((id) => getAgent(id));
  const routing = b.routing === "manual" ? "manual" : "auto";
  if (routing === "manual" && divisions.length === 0 && extras.length === 0) {
    return Response.json({ error: "Pilih minimal satu divisi atau agen" }, { status: 400 });
  }
  const participants = routing === "manual" ? participantsFor(divisions, extras) : [chair, ...extras].slice(0, MAX_PARTICIPANTS);
  // Manual + Produk Cerebrum tanpa aplikasi dicentang: aplikasi dipilih otomatis lebih dulu.
  const appIds = new Set(getAppAgents(leads[CEREBRUM]).map((a) => a.id));
  const needsAppRouting = routing === "manual" && divisions.includes(CEREBRUM) && !extras.some((id) => appIds.has(id));
  const status = routing === "auto" || needsAppRouting ? "routing" : "gathering";

  const id = createTask({ userId: user.id, title, brief, routing, provider: b.provider, model: b.model, participants, status });
  addMessage({ taskId: id, revision: 1, kind: "brief", agentId: null, content: brief });
  startMeeting(id, routing === "manual" ? divisions : null);
  return Response.json({ id });
});
