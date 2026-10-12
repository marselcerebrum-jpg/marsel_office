import "server-only";
import { getAgent, getAgentBody, getAgents } from "./agents-server";
import { getLeads } from "./leads";
import { LANGUAGE_RULE, streamText, type Provider } from "./llm";
import { emit, liveOf } from "./meeting";
import { getTask, updateTask, type Task, type TaskStatus } from "./tasks";
import {
  addAction,
  addDeliverable,
  getAction,
  getIntegration,
  listActions,
  listDeliverables,
  listIntegrations,
  runAction,
  updateAction,
  updateDeliverable,
  type Deliverable,
  type DeliverableType,
} from "./work";

/**
 * Tahap eksekusi setelah usulan disetujui:
 *   planning  : pemimpin rapat memecah usulan menjadi pekerjaan + penanggung jawab
 *   executing : tiap agen mengerjakan hasil nyata, diperiksa QA (maks. 2 perbaikan)
 *   delivered : Laporan Akhir disusun; pemberi tugas me-review paket hasil
 */

const QA_AGENT = "testing-reality-checker";
const MAX_ITEMS = 8;
const CONCURRENCY = Math.max(1, Math.min(3, Number(process.env.EXECUTION_CONCURRENCY ?? 2)));
const MAX_FIXES = 2;
const FINAL_KEY = "final";
const TYPES: DeliverableType[] = ["document", "report", "content", "spreadsheet", "code"];

const TYPE_LABEL: Record<DeliverableType, string> = {
  document: "dokumen bisnis",
  report: "laporan",
  content: "konten & copywriting",
  spreadsheet: "spreadsheet / data",
  code: "kode / teknis",
};

/* ------------------------------------------------------------------ util */

function publicD(d: Deliverable) {
  return d;
}

function pushD(taskId: number, id: number) {
  const d = listDeliverables(taskId).find((x) => x.id === id);
  if (d) emit(taskId, { type: "deliverable", d: publicD(d) });
}

function setStatus(task: Task, status: TaskStatus) {
  updateTask(task.id, { status });
  task.status = status;
  emit(task.id, { type: "status", status });
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…(dipotong)` : s);

function agentLine(id: string) {
  const a = getAgent(id);
  return a ? `${a.name} (${a.roleId ?? a.division})` : id;
}

function systemFor(id: string, extra: string) {
  return `${getAgentBody(id) ?? ""}${LANGUAGE_RULE}\n\n---\nKONTEKS: ${extra}`;
}

function taskBlock(task: Task) {
  return `TUGAS DARI PEMBERI TUGAS (${task.userName}):\nJudul: ${task.title}\nDetail:\n${task.brief}\n\nUSULAN AKHIR YANG SUDAH DISETUJUI:\n${clip(task.result ?? "(tidak ada)", 8000)}`;
}

/* ------------------------------------------------------------- penjadwal */

export function startExecution(taskId: number, opts: { reviseId?: number } = {}) {
  const live = liveOf(taskId);
  if (live.running) return false;
  live.running = true;
  run(taskId, opts)
    .catch((e) => {
      console.error(`[eksekusi ${taskId}]`, e);
      const message = e instanceof Error ? e.message : String(e);
      updateTask(taskId, { status: "failed", error: message });
      emit(taskId, { type: "error", message });
      emit(taskId, { type: "status", status: "failed" });
    })
    .finally(() => {
      live.running = false;
    });
  return true;
}

async function run(taskId: number, opts: { reviseId?: number }) {
  const task = getTask(taskId);
  if (!task) return;
  updateTask(task.id, { error: null });

  if (!listDeliverables(task.id).length) {
    setStatus(task, "planning");
    await plan(task);
  }
  setStatus(task, "executing");

  // Lanjutkan pekerjaan yang terhenti (mis. setelah restart) dari awal pekerjaan itu.
  for (const d of listDeliverables(task.id)) {
    if (["working", "qa", "revising"].includes(d.status)) {
      updateDeliverable(d.id, { status: "pending" });
      pushD(task.id, d.id);
    }
  }
  if (opts.reviseId) {
    const final = listDeliverables(task.id).find((d) => d.key === FINAL_KEY);
    if (final) {
      updateDeliverable(final.id, { status: "pending", content: "" });
      pushD(task.id, final.id);
    }
  }

  await workAll(task);
  await compileFinal(task);
  setStatus(task, "delivered");
}

/** Jalankan pekerjaan sesuai ketergantungan, beberapa sekaligus. */
async function workAll(task: Task) {
  const running = new Map<number, Promise<void>>();
  for (;;) {
    const all = listDeliverables(task.id).filter((d) => d.key !== FINAL_KEY);
    const done = new Set(all.filter((d) => d.status === "done" || d.status === "failed").map((d) => d.key));
    const ready = all.filter((d) => d.status === "pending" && !running.has(d.id) && d.dependsOn.every((k) => done.has(k) || !all.some((x) => x.key === k)));
    while (running.size < CONCURRENCY && ready.length) {
      const d = ready.shift()!;
      const p = workItem(task, d).finally(() => running.delete(d.id));
      running.set(d.id, p);
    }
    if (!running.size) {
      // Tidak ada yang berjalan: selesai, atau sisa pekerjaan terkunci ketergantungan yang gagal.
      for (const d of all.filter((x) => x.status === "pending")) {
        updateDeliverable(d.id, { status: "failed", qaNotes: "Tidak bisa dikerjakan karena pekerjaan yang dibutuhkan gagal." });
        pushD(task.id, d.id);
      }
      return;
    }
    await Promise.race(running.values());
  }
}

/* -------------------------------------------------------------- planning */

async function plan(task: Task) {
  const { chair } = getLeads();
  const participants = task.participants.filter((id) => id !== chair);
  const directory = getAgents()
    .map((a) => `- ${a.id}: ${a.name} — ${a.roleId ?? a.division}`)
    .join("\n");
  const prompt = `${taskBlock(task)}

Usulan di atas sudah disetujui dan sekarang HARUS DIKERJAKAN SAMPAI JADI. Pecah menjadi maksimal ${MAX_ITEMS} pekerjaan konkret, masing-masing menghasilkan satu hasil nyata (bukan rencana).

Peserta rapat (utamakan sebagai penanggung jawab): ${participants.map((id) => `${id} = ${agentLine(id)}`).join("; ") || "-"}

Jenis hasil yang tersedia: document (dokumen bisnis: strategi, SOP, proposal), report (laporan/analisis), content (konten & copywriting siap posting), spreadsheet (tabel data/angka), code (kode program).

Direktori semua agen (boleh menunjuk agen lain bila lebih cocok):
${directory}

Aturan:
- Tiap pekerjaan berdiri sendiri dan bisa diselesaikan satu agen dalam satu kali kerja.
- Isi "instructions" dengan detail: apa yang harus dihasilkan, isi minimal, panjang/jumlah, format.
- "depends_on" berisi key pekerjaan lain yang hasilnya dibutuhkan lebih dulu (boleh kosong).
- Jangan membuat pekerjaan "laporan akhir/rangkuman semua hasil"; itu disusun otomatis.

Balas HANYA dengan JSON tanpa teks lain, format:
{"items": [{"key": "d1", "title": "judul hasil", "type": "document", "assignee": "id-agen", "instructions": "…", "depends_on": []}]}`;

  const text = await streamText(task.provider as Provider, {
    model: task.model,
    system: systemFor(chair, 'Anda menyusun pembagian kerja eksekusi. Jawab dengan JSON {"items": [...]}.'),
    messages: [{ role: "user", content: prompt }],
    maxTokens: 6000,
    effort: "medium",
  });

  type Item = { key?: string; title?: string; type?: string; assignee?: string; instructions?: string; depends_on?: string[] };
  const raw = parseJson<{ items?: Item[] }>(text)?.items ?? [];
  const fallbackAssignee = participants[0] ?? chair;
  let items = raw
    .filter((i) => i.title && i.instructions)
    .slice(0, MAX_ITEMS)
    .map((i, n) => ({
      key: (i.key ?? `d${n + 1}`).toString().slice(0, 20),
      title: i.title!.slice(0, 160),
      type: (TYPES.includes(i.type as DeliverableType) ? i.type : "document") as DeliverableType,
      assignee: i.assignee && getAgent(i.assignee) ? i.assignee : fallbackAssignee,
      instructions: i.instructions!.slice(0, 4000),
      dependsOn: Array.isArray(i.depends_on) ? i.depends_on.map(String) : [],
    }));

  // Rencana tidak terbaca: satu pekerjaan per peserta sesuai bagiannya di usulan.
  if (!items.length) {
    items = (participants.length ? participants : [chair]).slice(0, MAX_ITEMS).map((id, n) => ({
      key: `d${n + 1}`,
      title: `Hasil kerja ${getAgent(id)?.name ?? id}`,
      type: "document" as DeliverableType,
      assignee: id,
      instructions: `Kerjakan sampai jadi bagian usulan yang menjadi tanggung jawab bidang ${agentLine(id)}. Serahkan hasil final yang siap dipakai.`,
      dependsOn: [],
    }));
  }
  const keys = new Set(items.map((i) => i.key));
  items.forEach((i, n) => {
    const id = addDeliverable({
      taskId: task.id,
      key: i.key,
      title: i.title,
      type: i.type,
      assignee: i.assignee,
      instructions: i.instructions,
      dependsOn: i.dependsOn.filter((k) => keys.has(k) && k !== i.key),
      position: n,
    });
    pushD(task.id, id);
  });
  const finalId = addDeliverable({
    taskId: task.id,
    key: FINAL_KEY,
    title: "Laporan Akhir",
    type: "report",
    assignee: chair,
    instructions: "Rangkuman seluruh hasil kerja untuk pemberi tugas.",
    dependsOn: items.map((i) => i.key),
    position: 999,
  });
  pushD(task.id, finalId);
}

/* ------------------------------------------------------------- pengerjaan */

const FORMAT_RULES: Record<DeliverableType, string> = {
  document:
    "Tulis dokumen FINAL yang lengkap dan siap dipakai dalam markdown (bukan rencana, bukan kerangka, tanpa placeholder). Gunakan judul, subjudul, daftar bernomor, dan tabel bila membantu.",
  report:
    "Tulis laporan FINAL dalam markdown: ringkasan eksekutif, temuan/data (pakai tabel bila ada angka), analisis, kesimpulan, dan rekomendasi yang bisa ditindaklanjuti.",
  content:
    "Tulis konten FINAL yang siap diposting/dikirim apa adanya: naskah lengkap, caption, hook, CTA, hashtag, atau pesan broadcast sesuai instruksi. Beri judul tiap konten dan tandai platformnya.",
  spreadsheet:
    "Sajikan hasil sebagai satu atau lebih TABEL markdown yang lengkap (setiap tabel diawali judul '## Nama Sheet' yang menjadi nama sheet Excel). Isi semua baris dengan data nyata/estimasi yang masuk akal; sel angka hanya berisi angka (tanpa 'Rp' atau '%'—tulis satuan di judul kolom). Tambahkan penjelasan singkat di luar tabel.",
  code:
    "Tulis kode LENGKAP yang bisa langsung dijalankan. Setiap file WAJIB memakai format:\n### File: `path/nama-file.ext`\n```bahasa\n<isi file lengkap>\n```\nSertakan file README.md yang menjelaskan cara memasang dan menjalankan. Jangan memotong kode dengan '...' atau komentar 'sisanya sama'.",
};

function integrationGuide() {
  const list = listIntegrations(true);
  if (!list.length) return "";
  return `

INTEGRASI APLIKASI INTERNAL (opsional, pakai hanya bila tugas memang meminta aksi di aplikasi tersebut):
${list.map((i) => `- ${i.slug}: ${i.name} — ${i.description}\n  Contoh input: ${i.inputExample}`).join("\n")}
Untuk meminta aksi, tulis blok berikut di akhir hasil Anda (boleh lebih dari satu):
\`\`\`action
{"integration": "slug-integrasi", "input": { … }, "reason": "kenapa aksi ini perlu"}
\`\`\`
Aksi TIDAK langsung dijalankan; pemberi tugas akan menyetujuinya lebih dulu.`;
}

const ACTION_RE = /```action\s*\n([\s\S]*?)\n```/g;

async function workItem(task: Task, d: Deliverable) {
  const live = liveOf(task.id);
  const deps = listDeliverables(task.id).filter((x) => d.dependsOn.includes(x.key) && x.status === "done");
  let draft = d.status === "pending" && d.revisionNote ? d.content : "";
  let notes = d.revisionNote ? `CATATAN REVISI DARI PEMBERI TUGAS:\n${d.revisionNote}` : "";
  let attempts = 0;

  for (;;) {
    const phase = attempts === 0 && !notes ? "working" : "revising";
    updateDeliverable(d.id, { status: phase, attempts });
    pushD(task.id, d.id);
    live.partialD.set(d.id, "");

    const prompt = `${taskBlock(task)}

PEKERJAAN ANDA: ${d.title}
Jenis hasil: ${TYPE_LABEL[d.type]} (JENIS HASIL: ${d.type})
Instruksi:
${d.instructions}
${deps.length ? `\nHASIL REKAN YANG BISA ANDA PAKAI:\n${deps.map((x) => `### ${x.title} (oleh ${agentLine(x.assignee)})\n${clip(x.content, 6000)}`).join("\n\n")}` : ""}
${draft ? `\nDRAF ANDA SEBELUMNYA:\n${clip(draft, 12000)}` : ""}
${notes ? `\n${notes}\nPerbaiki hasil sesuai catatan di atas dan serahkan versi lengkapnya (bukan hanya bagian yang berubah).` : ""}

ATURAN FORMAT:
${FORMAT_RULES[d.type]}
Langsung tulis hasilnya; jangan membuka dengan basa-basi atau menjelaskan apa yang akan Anda lakukan.${integrationGuide()}`;

    let content = "";
    try {
      content = await streamText(task.provider as Provider, {
        model: task.model,
        system: systemFor(d.assignee, "Anda sedang mengerjakan hasil nyata untuk tugas yang sudah disetujui di Agent Desk. Hasil Anda akan langsung dipakai."),
        messages: [{ role: "user", content: prompt }],
        maxTokens: d.type === "code" ? 48000 : 24000,
        effort: d.type === "code" ? "high" : "medium",
        onDelta: (t) => {
          live.partialD.set(d.id, (live.partialD.get(d.id) ?? "") + t);
          emit(task.id, { type: "d_delta", id: d.id, text: t });
        },
      });
    } finally {
      live.partialD.delete(d.id);
    }

    content = await extractActions(task, d, content);
    updateDeliverable(d.id, { content, status: "qa" });
    pushD(task.id, d.id);

    const verdict = await qa(task, d, content);
    if (verdict.pass || attempts >= MAX_FIXES) {
      const qaNotes = verdict.pass ? verdict.notes || "Lolos pemeriksaan QA." : `Belum sepenuhnya lolos QA setelah ${MAX_FIXES} perbaikan: ${verdict.notes}`;
      updateDeliverable(d.id, { status: "done", qaNotes, revisionNote: null });
      pushD(task.id, d.id);
      return;
    }
    attempts++;
    draft = content;
    notes = `CATATAN QA (Reality Checker):\n${verdict.notes}`;
    updateDeliverable(d.id, { qaNotes: verdict.notes });
  }
}

/** Ambil blok ```action``` menjadi permintaan aksi; hapus dari isi hasil. */
async function extractActions(task: Task, d: Deliverable, content: string) {
  const found = [...content.matchAll(ACTION_RE)];
  if (!found.length) return content;
  for (const m of found) {
    const req = parseJson<{ integration?: string; input?: unknown; reason?: string }>(m[1]);
    if (!req?.integration || !getIntegration(req.integration)) continue;
    const id = addAction({ taskId: task.id, deliverableId: d.id, agentId: d.assignee, integration: req.integration, input: req.input ?? {}, reason: req.reason ?? null });
    const integ = getIntegration(req.integration)!;
    if (integ.autoApprove) await executeAction(id, null);
    else emit(task.id, { type: "action", a: getAction(id) });
  }
  return content.replace(ACTION_RE, "").trimEnd() + `\n\n> ⚙️ ${found.length} permintaan aksi ke aplikasi internal dicatat di tab Aksi.`;
}

export async function executeAction(id: number, userId: number | null) {
  const a = getAction(id);
  if (!a) return;
  updateAction(id, { status: "approved", decidedBy: userId });
  const task = getTask(a.taskId);
  const r = await runAction(a, { taskTitle: task?.title ?? "" });
  updateAction(id, { status: r.ok ? "done" : "failed", result: r.result });
  emit(a.taskId, { type: "action", a: getAction(id) });
}

/* --------------------------------------------------------------------- QA */

async function qa(task: Task, d: Deliverable, content: string): Promise<{ pass: boolean; notes: string }> {
  const checker = getAgent(QA_AGENT) ? QA_AGENT : getLeads().chair;
  updateDeliverable(d.id, { status: "qa" });
  pushD(task.id, d.id);
  const text = await streamText(task.provider as Provider, {
    model: task.model,
    system: systemFor(checker, "Anda memeriksa kualitas hasil kerja sebelum diserahkan ke pemberi tugas. Nilai secara jujur, tapi jangan menuntut hal di luar instruksi."),
    messages: [
      {
        role: "user",
        content: `${taskBlock(task)}

HASIL YANG DIPERIKSA: ${d.title} (jenis: ${TYPE_LABEL[d.type]}, oleh ${agentLine(d.assignee)})
Instruksi pekerjaan:
${d.instructions}

ISI HASIL:
${clip(content, 24000)}

Periksa: apakah hasil benar-benar FINAL dan siap pakai (bukan rencana/placeholder), lengkap sesuai instruksi, konsisten dengan usulan yang disetujui, dan bebas kesalahan jelas${d.type === "code" ? " (kode lengkap, tidak terpotong, ada README)" : ""}${d.type === "spreadsheet" ? " (tabel lengkap, angka masuk akal)" : ""}.
Balas HANYA dengan JSON tanpa teks lain: {"verdict": "lulus" atau "perbaiki", "catatan": "poin perbaikan yang spesifik, atau ringkasan singkat bila lulus"}`,
      },
    ],
    maxTokens: 2000,
    effort: "low",
  });
  const j = parseJson<{ verdict?: string; catatan?: string }>(text);
  if (!j?.verdict) return { pass: true, notes: "QA tidak memberi penilaian terstruktur; diloloskan." };
  return { pass: !/perbaik/i.test(j.verdict), notes: (j.catatan ?? "").slice(0, 2000) };
}

/* ---------------------------------------------------------- laporan akhir */

async function compileFinal(task: Task) {
  const live = liveOf(task.id);
  const all = listDeliverables(task.id);
  const final = all.find((d) => d.key === FINAL_KEY);
  if (!final) return;
  const items = all.filter((d) => d.key !== FINAL_KEY);
  const actions = listActions(task.id);
  updateDeliverable(final.id, { status: "working" });
  pushD(task.id, final.id);
  live.partialD.set(final.id, "");
  let content = "";
  try {
    content = await streamText(task.provider as Provider, {
      model: task.model,
      system: systemFor(final.assignee, "Anda menyusun laporan akhir penyerahan hasil kerja tim untuk pemberi tugas di Agent Desk."),
      messages: [
        {
          role: "user",
          content: `${taskBlock(task)}

HASIL KERJA TIM:
${items
  .map((d) => `### ${d.title}\nJenis: ${TYPE_LABEL[d.type]} · Oleh: ${agentLine(d.assignee)} · Status: ${d.status === "done" ? "selesai" : "gagal"}\nCatatan QA: ${d.qaNotes ?? "-"}\nCuplikan:\n${clip(d.content, 1500)}`)
  .join("\n\n")}

PERMINTAAN AKSI KE APLIKASI INTERNAL: ${actions.length ? actions.map((a) => `${a.integration} (${a.status}) — ${a.reason ?? ""}`).join("; ") : "tidak ada"}

Susun LAPORAN AKHIR dalam markdown dengan bagian:
## Ringkasan Eksekutif
## Hasil yang Diserahkan (tabel: Hasil | Dikerjakan oleh | Status QA | Cara memakai)
## Catatan QA & Risiko
## Aksi ke Aplikasi Internal
## Langkah Selanjutnya untuk Tim
Ringkas, jujur tentang kekurangan, dan langsung bisa ditindaklanjuti.`,
        },
      ],
      maxTokens: 6000,
      effort: "medium",
      onDelta: (t) => {
        live.partialD.set(final.id, (live.partialD.get(final.id) ?? "") + t);
        emit(task.id, { type: "d_delta", id: final.id, text: t });
      },
    });
  } finally {
    live.partialD.delete(final.id);
  }
  updateDeliverable(final.id, { status: "done", content, qaNotes: null });
  pushD(task.id, final.id);
}
