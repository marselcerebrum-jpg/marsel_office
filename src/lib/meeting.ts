import "server-only";
import { EventEmitter } from "node:events";
import { getAgent, getAgentBody, getAgents, getAppAgents, getDivisions } from "./agents-server";
import { getLeads } from "./leads";
import { LANGUAGE_RULE, streamText, type Provider } from "./llm";
import { addMessage, getTask, listMessages, setMessageContent, updateTask, type Task, type TaskStatus } from "./tasks";
import { DIVISION_LABELS_ID } from "./types";

/* ------------------------------------------------------------------ event */

export type MeetingEvent =
  | { type: "status"; status: TaskStatus; participants?: string[] }
  | { type: "message_start"; id: number; agentId: string | null; kind: string; revision: number }
  | { type: "delta"; id: number; text: string }
  | { type: "message_end"; id: number }
  | { type: "result"; content: string }
  | { type: "error"; message: string }
  | { type: "deliverable"; d: unknown }
  | { type: "d_delta"; id: number; text: string }
  | { type: "action"; a: unknown };

/** partial = pesan rapat yang sedang ditulis; partialD = hasil kerja yang sedang ditulis. */
type Live = { emitter: EventEmitter; partial: Map<number, string>; partialD: Map<number, string>; running: boolean };
const g = globalThis as unknown as { __meetings?: Map<number, Live> };
const meetings = (g.__meetings ??= new Map());

export function liveOf(taskId: number): Live {
  let l = meetings.get(taskId);
  if (!l) {
    l = { emitter: new EventEmitter(), partial: new Map(), partialD: new Map(), running: false };
    l.emitter.setMaxListeners(100);
    meetings.set(taskId, l);
  }
  return l;
}

export function emit(taskId: number, e: MeetingEvent) {
  liveOf(taskId).emitter.emit("event", e);
}

/* --------------------------------------------------------------- konfigurasi */

/** Waktu yang diberikan agar para lead sempat berjalan ke ruang rapat di layar. */
const GATHER_MS = Number(process.env.MEETING_GATHER_MS ?? 14000);
const ROUNDS = Math.min(2, Math.max(1, Number(process.env.MEETING_ROUNDS ?? 1)));
export const MAX_PARTICIPANTS = 10;
export const CEREBRUM = "cerebrum-product";
const MAX_APPS = 4;

/* ------------------------------------------------------------------ prompt */

function agentLine(id: string) {
  const a = getAgent(id);
  if (!a) return id;
  return `${a.name} (${a.roleId ?? a.division}, divisi ${DIVISION_LABELS_ID[a.division] ?? a.division})`;
}

function systemFor(id: string, extra: string) {
  const body = getAgentBody(id) ?? "";
  return `${body}${LANGUAGE_RULE}\n\n---\nKONTEKS: ${extra}`;
}

function transcriptText(task: Task) {
  const msgs = listMessages(task.id);
  return msgs
    .map((m) => {
      if (m.kind === "brief") return null;
      if (m.kind === "review") return `[Pemberi tugas — catatan revisi #${m.revision - 1}]: ${m.content}`;
      if (m.kind === "summary") return `[Usulan akhir revisi #${m.revision} — ${agentLine(m.agentId ?? "")}]:\n${m.content}`;
      if (m.kind === "system") return null;
      return `[${agentLine(m.agentId ?? "")}]: ${m.content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function taskBlock(task: Task) {
  return `TUGAS DARI PEMBERI TUGAS (${task.userName}):\nJudul: ${task.title}\nDetail:\n${task.brief}`;
}

/* ------------------------------------------------------------------ routing */

/**
 * Peserta: ketua rapat + lead tiap divisi + agen tambahan. Bila ada Product Specialist
 * aplikasi Cerebrum yang ikut, Product Manager Cerebrum (lead-nya) otomatis ikut.
 */
export function participantsFor(divisions: string[], extraAgents: string[]): string[] {
  const { chair, leads } = getLeads();
  const apps = new Set(getAppAgents(leads[CEREBRUM]).map((a) => a.id));
  const divs = new Set(divisions);
  if (extraAgents.some((id) => apps.has(id))) divs.add(CEREBRUM);
  const ids = [chair, ...[...divs].map((d) => leads[d]).filter(Boolean), ...extraAgents];
  return [...new Set(ids)].filter((id) => !!getAgent(id)).slice(0, MAX_PARTICIPANTS);
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
  } catch {
    return null;
  }
}

function appOptions() {
  const { leads } = getLeads();
  return getAppAgents(leads[CEREBRUM])
    .map((a) => `- ${a.id}: ${a.app ?? a.name} — ${a.descriptionId ?? a.description}`)
    .join("\n");
}

/** Mode otomatis: pemimpin rapat memilih divisi (dan aplikasi Cerebrum bila relevan). */
async function routeDivisions(task: Task): Promise<{ divisions: string[]; apps: string[] }> {
  const { chair, leads } = getLeads();
  const options = getDivisions()
    .filter((d) => leads[d.id])
    .map((d) => {
      const lead = getAgent(leads[d.id]);
      return `- ${d.id}: ${DIVISION_LABELS_ID[d.id] ?? d.label} — lead ${lead?.name}: ${lead?.descriptionId ?? lead?.description ?? ""}`;
    })
    .join("\n");
  const apps = appOptions();
  const prompt = `${taskBlock(task)}

Anda memimpin rapat. Pilih 2–4 divisi yang lead-nya paling relevan untuk membahas tugas ini. Pilihan divisi:
${options}
${apps ? `
Bila tugas menyangkut produk PT Cerebrum, sertakan divisi "${CEREBRUM}" dan pilih 1–${MAX_APPS} aplikasi yang paling terdampak (Product Specialist-nya ikut rapat). Pilihan aplikasi:
${apps}
` : ""}
Balas HANYA dengan JSON tanpa teks lain, format: {"divisions": ["id-divisi", ...], "apps": ["id-aplikasi", ...], "agenda": "satu kalimat agenda rapat"}`;

  const text = await streamText(task.provider as Provider, {
    model: task.model,
    system: systemFor(chair, 'Anda sedang memilih peserta rapat. Jawab dengan JSON {"divisions": [...], "apps": [...], "agenda": "..."}.'),
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
    effort: "low",
  });
  const json = parseJson<{ divisions?: string[]; apps?: string[] }>(text);
  const validApps = new Set(getAppAgents(leads[CEREBRUM]).map((a) => a.id));
  const divisions = (json?.divisions ?? []).filter((d) => leads[d]).slice(0, 4);
  const pickedApps = (json?.apps ?? []).filter((id) => validApps.has(id)).slice(0, MAX_APPS);
  return { divisions: divisions.length ? divisions : ["specialized", "project-management"], apps: pickedApps };
}

/** Mode manual dengan divisi Produk Cerebrum tapi tanpa aplikasi dipilih: Product Manager Cerebrum yang memilih. */
async function routeApps(task: Task): Promise<string[]> {
  const { leads } = getLeads();
  const pm = leads[CEREBRUM];
  const apps = appOptions();
  if (!apps || !pm) return [];
  const text = await streamText(task.provider as Provider, {
    model: task.model,
    system: systemFor(pm, 'Anda sedang memilih Product Specialist aplikasi yang ikut rapat. Jawab dengan JSON {"apps": [...]}.'),
    messages: [
      {
        role: "user",
        content: `${taskBlock(task)}

Pilih 1–${MAX_APPS} aplikasi PT Cerebrum yang paling terdampak tugas ini. Pilihan:
${apps}

Balas HANYA dengan JSON tanpa teks lain, format: {"apps": ["id-aplikasi", ...]}`,
      },
    ],
    maxTokens: 800,
    effort: "low",
  });
  const valid = new Set(getAppAgents(pm).map((a) => a.id));
  return (parseJson<{ apps?: string[] }>(text)?.apps ?? []).filter((id) => valid.has(id)).slice(0, MAX_APPS);
}

/* ------------------------------------------------------------------ giliran */

async function speak(task: Task, agentId: string, kind: "agent" | "summary", prompt: string, opts: { maxTokens: number; effort: "low" | "medium" }) {
  const live = liveOf(task.id);
  const id = addMessage({ taskId: task.id, revision: task.revision, kind, agentId, content: "" });
  live.partial.set(id, "");
  emit(task.id, { type: "message_start", id, agentId, kind, revision: task.revision });
  let content = "";
  try {
    content = await streamText(task.provider as Provider, {
      model: task.model,
      system: systemFor(
        agentId,
        kind === "summary"
          ? "Anda memimpin rapat tim di Agent Desk dan bertugas menyusun usulan akhir untuk direview pemberi tugas."
          : "Anda sedang mengikuti rapat tim lintas divisi di Agent Desk sebagai perwakilan bidang keahlian Anda.",
      ),
      messages: [{ role: "user", content: prompt }],
      maxTokens: opts.maxTokens,
      effort: opts.effort,
      onDelta: (t) => {
        live.partial.set(id, (live.partial.get(id) ?? "") + t);
        emit(task.id, { type: "delta", id, text: t });
      },
    });
  } finally {
    setMessageContent(id, content || live.partial.get(id) || "");
    live.partial.delete(id);
    emit(task.id, { type: "message_end", id });
  }
  return content;
}

function setStatus(task: Task, status: TaskStatus, participants?: string[]) {
  updateTask(task.id, participants ? { status, participants } : { status });
  task.status = status;
  if (participants) task.participants = participants;
  emit(task.id, { type: "status", status, participants });
}

/* ------------------------------------------------------------------ jalankan */

export function startMeeting(taskId: number, divisionsHint: string[] | null) {
  const live = liveOf(taskId);
  if (live.running) return;
  live.running = true;
  runMeeting(taskId, divisionsHint)
    .catch((e) => {
      console.error(`[rapat ${taskId}]`, e);
      const message = e instanceof Error ? e.message : String(e);
      updateTask(taskId, { status: "failed", error: message });
      emit(taskId, { type: "error", message });
      emit(taskId, { type: "status", status: "failed" });
    })
    .finally(() => {
      live.running = false;
    });
}

async function runMeeting(taskId: number, divisionsHint: string[] | null) {
  const task = getTask(taskId);
  if (!task) return;
  const { chair } = getLeads();

  if (task.status === "routing") {
    const extras = task.participants.filter((id) => id !== chair);
    let divisions: string[];
    let apps: string[] = [];
    if (divisionsHint) {
      // Manual + Produk Cerebrum tanpa aplikasi dipilih: biarkan Product Manager Cerebrum memilih.
      divisions = divisionsHint;
      if (divisions.includes(CEREBRUM)) apps = await routeApps(task);
    } else {
      ({ divisions, apps } = await routeDivisions(task));
    }
    setStatus(task, "gathering", participantsFor(divisions, [...extras, ...apps]));
  } else {
    setStatus(task, "gathering", task.participants);
  }

  // Beri waktu animasi berjalan ke ruang rapat.
  await new Promise((r) => setTimeout(r, GATHER_MS));
  setStatus(task, "meeting");

  const speakers = task.participants.filter((id) => id !== chair);
  const revisionNote =
    task.revision > 1 && task.reviewNote
      ? `\n\nCATATAN REVISI DARI PEMBERI TUGAS (wajib ditindaklanjuti):\n${task.reviewNote}`
      : "";

  await speak(
    task,
    chair,
    "agent",
    `${taskBlock(task)}${revisionNote}

Peserta rapat: ${speakers.map(agentLine).join("; ")}.
${task.revision > 1 ? `\nTRANSKRIP SEBELUMNYA:\n${transcriptText(task)}\n` : ""}
Buka rapat ini secara singkat (maksimal 120 kata): tegaskan tujuan, apa yang Anda butuhkan dari tiap peserta, dan batasan penting. Jangan menjawab tugasnya dulu.`,
    { maxTokens: 1200, effort: "low" },
  );

  for (let round = 1; round <= ROUNDS; round++) {
    for (const id of speakers) {
      await speak(
        task,
        id,
        "agent",
        `${taskBlock(task)}${revisionNote}

TRANSKRIP RAPAT SEJAUH INI:
${transcriptText(task)}

Giliran Anda (${agentLine(id)})${round > 1 ? `, putaran ${round}: tanggapi masukan peserta lain, sepakati atau sanggah dengan alasan` : ""}.
Berikan masukan dari sudut keahlian Anda: (1) pendekatan yang Anda sarankan, (2) apa yang akan dikerjakan divisi Anda, (3) risiko atau ketergantungan. Maksimal 220 kata, langsung ke inti, jangan mengulang poin peserta lain.`,
        { maxTokens: 2000, effort: "low" },
      );
    }
  }

  const result = await speak(
    task,
    chair,
    "summary",
    `${taskBlock(task)}${revisionNote}

TRANSKRIP RAPAT:
${transcriptText(task)}

Susun USULAN AKHIR untuk direview pemberi tugas. Keputusan akhir ada di tangan pemberi tugas, jadi tulis sebagai usulan. Gunakan markdown dengan bagian:
## Ringkasan
## Keputusan yang Diusulkan
## Rencana Kerja (tabel: Langkah | Penanggung jawab | Target)
## Risiko & Mitigasi
## Yang Perlu Anda Putuskan
Padat dan bisa langsung dieksekusi.`,
    { maxTokens: 6000, effort: "medium" },
  );

  updateTask(task.id, { result, status: "review", error: null });
  emit(task.id, { type: "result", content: result });
  emit(task.id, { type: "status", status: "review" });
}

/** Ringkas daftar agen untuk dropdown pilih peserta tambahan. */
export function agentOptions() {
  return getAgents().map((a) => ({ id: a.id, name: a.name, division: a.division }));
}

/** Rapat yang tercatat berjalan tapi tidak hidup di proses ini (mis. setelah restart) ditandai gagal. */
export function reconcileStale(tasks: Task[]) {
  for (const t of tasks) {
    if (["routing", "gathering", "meeting", "planning", "executing"].includes(t.status) && !liveOf(t.id).running) {
      const error = ["planning", "executing"].includes(t.status)
        ? "Pengerjaan terputus karena server dimulai ulang. Klik \"Lanjutkan pengerjaan\"."
        : "Rapat terputus karena server dimulai ulang. Klik \"Ulangi rapat\".";
      updateTask(t.id, { status: "failed", error });
      t.status = "failed";
      t.error = error;
    }
  }
}
