import { apiUser, handle } from "@/lib/auth";
import { renderDeliverable } from "@/lib/deliverable-files";
import { driveEnabled, uploadToDrive } from "@/lib/drive";
import { extractTables, markdownToHtml } from "@/lib/formats";
import { getTask } from "@/lib/tasks";
import { getDeliverable } from "@/lib/work";

/** Simpan satu hasil ke Google Drive: dokumen → Google Docs, spreadsheet → Google Sheets, kode → .zip. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/deliverables/[id]/drive">) => {
  await apiUser();
  if (!driveEnabled()) return Response.json({ error: "Google Drive belum dikonfigurasi di server" }, { status: 400 });
  const d = getDeliverable(Number((await ctx.params).id));
  if (!d?.content.trim()) return Response.json({ error: "Hasil belum ada" }, { status: 404 });
  const task = getTask(d.taskId);
  const name = `${task?.title ?? "Tugas"} — ${d.title}`;
  let link: string;
  if (d.type === "code") {
    const z = await renderDeliverable(d, "zip").catch(() => null);
    link = z
      ? await uploadToDrive({ name: `${name}.zip`, data: z.data, mime: z.mime })
      : await uploadToDrive({ name, data: markdownToHtml(d.content, name), mime: "text/html", convertTo: "document" });
  } else if (d.type === "spreadsheet" && extractTables(d.content).length) {
    const x = await renderDeliverable(d, "xlsx");
    link = await uploadToDrive({ name, data: x.data, mime: x.mime, convertTo: "spreadsheet" });
  } else {
    link = await uploadToDrive({ name, data: markdownToHtml(d.content, name), mime: "text/html", convertTo: "document" });
  }
  return Response.json({ link });
});
