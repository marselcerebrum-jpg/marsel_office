import "server-only";
import type { StreamRequest } from "./index";

/**
 * Penyedia tiruan untuk mencoba alur aplikasi tanpa API key (aktif bila LLM_MOCK=1).
 * Jawabannya templat, mengalir pelan seperti model sungguhan.
 */
export async function streamMock(req: StreamRequest): Promise<string> {
  const persona = req.system.match(/You are \*\*([^*]+)\*\*/)?.[1] ?? req.system.match(/^# (.+)$/m)?.[1] ?? "Agen";
  const last = req.messages.at(-1)?.content ?? "";

  let text: string;
  if (/\{"divisions"/.test(req.system) || /Balas HANYA dengan JSON/.test(last)) {
    const ids = [...last.matchAll(/^- ([a-z-]+):/gm)].map((m) => m[1]);
    text = JSON.stringify({ divisions: ids.slice(0, 3), agenda: "Membahas kebutuhan, risiko, dan rencana eksekusi tugas." });
  } else if (/USULAN AKHIR/.test(last)) {
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
