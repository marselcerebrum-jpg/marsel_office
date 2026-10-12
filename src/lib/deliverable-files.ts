import "server-only";
import { extractCodeFiles, extractTables, filesToZip, markdownToDocx, safeName, tablesToXlsx } from "./formats";
import type { Deliverable } from "./work";

export type Format = "md" | "docx" | "xlsx" | "zip";

/** Format unduhan yang masuk akal untuk satu hasil kerja. */
export function formatsFor(d: Pick<Deliverable, "type" | "content">): Format[] {
  const f: Format[] = ["md", "docx"];
  if (extractTables(d.content).length) f.push("xlsx");
  if (extractCodeFiles(d.content).length) f.push("zip");
  return f;
}

const MIME: Record<Format, string> = {
  md: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export async function renderDeliverable(d: Deliverable, format: Format): Promise<{ data: Buffer; name: string; mime: string }> {
  const base = safeName(d.title);
  switch (format) {
    case "md":
      return { data: Buffer.from(d.content, "utf8"), name: `${base}.md`, mime: MIME.md };
    case "docx":
      return { data: await markdownToDocx(d.content, d.title), name: `${base}.docx`, mime: MIME.docx };
    case "xlsx": {
      const tables = extractTables(d.content);
      if (!tables.length) throw new Error("Hasil ini tidak berisi tabel");
      return { data: await tablesToXlsx(tables), name: `${base}.xlsx`, mime: MIME.xlsx };
    }
    case "zip": {
      const files = extractCodeFiles(d.content);
      if (!files.length) throw new Error("Hasil ini tidak berisi file kode");
      const data = await filesToZip([...files.map((f) => ({ path: f.path, data: f.code })), { path: "_HASIL-LENGKAP.md", data: d.content }]);
      return { data, name: `${base}.zip`, mime: MIME.zip };
    }
  }
}

/** Satu .zip berisi semua hasil kerja tugas dalam berbagai format. */
export async function renderPackage(title: string, items: Deliverable[]): Promise<{ data: Buffer; name: string }> {
  const files: { path: string; data: string | Buffer }[] = [];
  let n = 0;
  for (const d of items) {
    if (!d.content.trim()) continue;
    const folder = d.key === "final" ? "00-Laporan-Akhir" : `${String(++n).padStart(2, "0")}-${safeName(d.title)}`;
    files.push({ path: `${folder}/${safeName(d.title)}.md`, data: d.content });
    files.push({ path: `${folder}/${safeName(d.title)}.docx`, data: await markdownToDocx(d.content, d.title) });
    const tables = extractTables(d.content);
    if (tables.length) files.push({ path: `${folder}/${safeName(d.title)}.xlsx`, data: await tablesToXlsx(tables) });
    for (const f of extractCodeFiles(d.content)) files.push({ path: `${folder}/kode/${f.path}`, data: f.code });
  }
  return { data: await filesToZip(files), name: `${safeName(title)}-hasil.zip` };
}

export function downloadResponse(data: Buffer, name: string, mime: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
