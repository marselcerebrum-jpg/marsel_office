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
  if (/Balas HANYA dengan JSON/.test(last)) {
    const ids = [...last.matchAll(/^- ([a-z0-9-]+):/gm)].map((m) => m[1]);
    const apps = ids.filter((id) => id.startsWith("cerebrum-app-")).slice(0, 2);
    const divisions = ids.filter((id) => !id.startsWith("cerebrum-app-")).slice(0, 2);
    // Simulasi: tugas yang menyebut "Cerebrum" mengundang divisi Produk Cerebrum + 2 aplikasi pertama.
    if (/cerebrum/i.test(last.split("Pilihan")[0]) && apps.length) divisions.push("cerebrum-product");
    text = JSON.stringify({ divisions, apps, agenda: "Membahas kebutuhan, risiko, dan rencana eksekusi tugas." });
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
