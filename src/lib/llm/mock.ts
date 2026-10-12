import "server-only";
import type { StreamRequest } from "./index";

/**
 * Penyedia tiruan untuk mencoba alur aplikasi tanpa API key (aktif bila LLM_MOCK=1).
 * Jawabannya templat, mengalir pelan seperti model sungguhan.
 */
export async function streamMock(req: StreamRequest): Promise<string> {
  const persona = req.system.match(/You are \*\*([^*]+)\*\*/)?.[1] ?? req.system.match(/^# (.+)$/m)?.[1] ?? "Agen";
  const last = req.messages.at(-1)?.content ?? "";
  const kind = last.match(/JENIS HASIL: (\w+)/)?.[1];

  let text: string;
  if (/\{"items"/.test(last)) {
    // Pembagian kerja: satu dokumen, satu spreadsheet, satu kode dari peserta rapat.
    const people = [...last.matchAll(/([a-z0-9-]+) = /g)].map((m) => m[1]);
    const who = (i: number) => people[i % Math.max(1, people.length)] ?? "agents-orchestrator";
    text = JSON.stringify({
      items: [
        { key: "d1", title: "Dokumen strategi & SOP", type: "document", assignee: who(0), instructions: "Tulis strategi final dan SOP pelaksanaannya.", depends_on: [] },
        { key: "d2", title: "Kalender & anggaran (spreadsheet)", type: "spreadsheet", assignee: who(1), instructions: "Buat tabel kalender 4 minggu dan rincian anggaran.", depends_on: ["d1"] },
        { key: "d3", title: "Landing page pendaftaran", type: "code", assignee: who(2), instructions: "Buat landing page HTML sederhana dengan formulir pendaftaran.", depends_on: ["d1"] },
      ],
    });
  } else if (/"verdict"/.test(last)) {
    text = JSON.stringify({ verdict: "lulus", catatan: "Simulasi: hasil lengkap dan sesuai instruksi." });
  } else if (/Balas HANYA dengan JSON/.test(last)) {
    const ids = [...last.matchAll(/^- ([a-z0-9-]+):/gm)].map((m) => m[1]);
    const apps = ids.filter((id) => id.startsWith("cerebrum-app-")).slice(0, 2);
    const divisions = ids.filter((id) => !id.startsWith("cerebrum-app-")).slice(0, 2);
    // Simulasi: tugas yang menyebut "Cerebrum" mengundang divisi Produk Cerebrum + 2 aplikasi pertama.
    if (/cerebrum/i.test(last.split("Pilihan")[0]) && apps.length) divisions.push("cerebrum-product");
    text = JSON.stringify({ divisions, apps, agenda: "Membahas kebutuhan, risiko, dan rencana eksekusi tugas." });
  } else if (kind === "spreadsheet") {
    text = [
      "## Kalender Konten",
      "| Minggu | Tema | Jumlah posting | Target views |",
      "|---|---|---|---|",
      "| 1 | Pengenalan kelas | 5 | 20000 |",
      "| 2 | Tips soal TWK | 6 | 30000 |",
      "| 3 | Testimoni alumni | 5 | 35000 |",
      "| 4 | Promo pendaftaran | 7 | 50000 |",
      "",
      "## Anggaran (Rp)",
      "| Pos | Biaya |",
      "|---|---|",
      "| Iklan TikTok | 3000000 |",
      "| Produksi konten | 1500000 |",
      "| Hadiah giveaway | 500000 |",
      "",
      "Data simulasi; pasang API key untuk hasil sungguhan.",
    ].join("\n");
  } else if (kind === "code") {
    text = [
      "Landing page sederhana (simulasi).",
      "",
      "### File: `index.html`",
      "```html",
      '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Daftar Kelas CPNS</title></head>',
      '<body><h1>Daftar Kelas CPNS 2026</h1><form><input name="nama" placeholder="Nama"><button>Daftar</button></form></body></html>',
      "```",
      "",
      "### File: `README.md`",
      "```markdown",
      "Buka index.html di browser.",
      "```",
    ].join("\n");
  } else if (/Susun LAPORAN AKHIR/.test(last)) {
    text = [
      "## Ringkasan Eksekutif",
      "Semua pekerjaan selesai dan lolos QA (simulasi).",
      "",
      "## Hasil yang Diserahkan",
      "| Hasil | Dikerjakan oleh | Status QA | Cara memakai |",
      "|---|---|---|---|",
      "| Dokumen strategi & SOP | Tim | Lolos | Bagikan ke tim pelaksana |",
      "| Kalender & anggaran | Tim | Lolos | Unduh .xlsx |",
      "| Landing page | Tim | Lolos | Unduh .zip lalu unggah ke hosting |",
      "",
      "## Langkah Selanjutnya untuk Tim",
      "- Pasang API key untuk hasil sungguhan.",
    ].join("\n");
  } else if (kind) {
    text = `# Hasil kerja (simulasi)\n\nSebagai **${persona}**, berikut hasil final untuk pekerjaan ini.\n\n## Strategi\n1. Fokus pada satu tujuan utama.\n2. Ukur dengan 2–3 metrik.\n\n## SOP\n- Langkah 1: siapkan materi.\n- Langkah 2: jalankan.\n- Langkah 3: evaluasi mingguan.`;
    // Bila ada integrasi aktif, simulasikan satu permintaan aksi ke integrasi pertama.
    const slug = last.match(/INTEGRASI APLIKASI INTERNAL[\s\S]*?\n- ([a-z0-9-]+):/)?.[1];
    if (slug) text += `\n\n\`\`\`action\n{"integration": "${slug}", "input": {"catatan": "uji coba"}, "reason": "Simulasi permintaan aksi"}\n\`\`\``;
  } else if (/Susun USULAN AKHIR/.test(last)) {
    text = [
      "## Ringkasan",
      "Tim sepakat dengan pendekatan bertahap untuk tugas ini (jawaban simulasi).",
      "",
      "## Keputusan yang Diusulkan",
      "1. Mulai dari versi kecil yang bisa diuji dalam 1 minggu.",
      "2. Ukur hasil dengan 2–3 metrik utama sebelum memperluas.",
      "",
      "## Rencana Kerja",
      "| Langkah | Penanggung jawab | Target |",
      "|---|---|---|",
      "| Riset & rencana | Lead terkait | Hari 1–2 |",
      "| Eksekusi | Tim divisi | Hari 3–5 |",
      "| Review | Anda | Hari 6 |",
      "",
      "## Risiko",
      "- Ini teks simulasi; pasang API key untuk jawaban sungguhan.",
    ].join("\n");
  } else {
    text = `Sebagai **${persona}**, masukan saya (simulasi): fokuskan dulu pada tujuan utama, tetapkan ukuran keberhasilan yang jelas, dan identifikasi risiko terbesar di bidang saya sebelum eksekusi. Saya siap menyiapkan detailnya setelah arah disetujui.`;
  }

  let out = "";
  for (const word of text.split(/(?<=\s)/)) {
    if (req.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, Number(process.env.MOCK_DELAY_MS ?? 18)));
    out += word;
    req.onDelta?.(word);
  }
  return out;
}
