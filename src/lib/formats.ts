import "server-only";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { marked, type Token, type Tokens } from "marked";

/* ------------------------------------------------------------ penguraian */

export type CodeFile = { path: string; lang: string; code: string };

/** File kode ditulis agen sebagai "### File: `path`" diikuti blok kode. */
export function extractCodeFiles(md: string): CodeFile[] {
  const files: CodeFile[] = [];
  const re = /^#{2,4}\s*(?:File|Berkas)\s*:\s*`?([^`\n]+?)`?\s*\n+```([\w+-]*)\n([\s\S]*?)\n```/gim;
  for (const m of md.matchAll(re)) files.push({ path: m[1].trim().replace(/^\/+/, ""), lang: m[2], code: m[3] });
  return files;
}

export type SheetTable = { name: string; header: string[]; rows: string[][] };

const stripMd = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").trim();

/** Semua tabel markdown (dan blok ```csv) beserta nama dari judul terdekat di atasnya. */
export function extractTables(md: string): SheetTable[] {
  const out: SheetTable[] = [];
  let heading = "";
  for (const t of marked.lexer(md)) {
    if (t.type === "heading") heading = stripMd((t as Tokens.Heading).text);
    if (t.type === "table") {
      const tb = t as Tokens.Table;
      out.push({ name: heading || `Tabel ${out.length + 1}`, header: tb.header.map((c) => stripMd(c.text)), rows: tb.rows.map((r) => r.map((c) => stripMd(c.text))) });
    }
    if (t.type === "code" && /^csv$/i.test((t as Tokens.Code).lang ?? "")) {
      const lines = (t as Tokens.Code).text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
      if (lines.length) out.push({ name: heading || `Data ${out.length + 1}`, header: lines[0], rows: lines.slice(1) });
    }
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/* ----------------------------------------------------------------- xlsx */

export async function tablesToXlsx(tables: SheetTable[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agent Desk";
  const used = new Set<string>();
  for (const t of tables) {
    let name = t.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet";
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 25)} ${n++}`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    ws.addRow(t.header);
    for (const r of t.rows) ws.addRow(r.map((c) => (/^-?\d+(?:[.,]\d+)?$/.test(c) ? Number(c.replace(",", ".")) : c)));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF06304A" } };
    ws.columns.forEach((col, i) => {
      const width = Math.max(t.header[i]?.length ?? 8, ...t.rows.map((r) => (r[i] ?? "").length));
      col.width = Math.min(60, Math.max(10, width + 2));
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ----------------------------------------------------------------- docx */

function runs(tokens: Token[] | undefined, style: { bold?: boolean; italics?: boolean; code?: boolean } = {}): TextRun[] {
  if (!tokens) return [];
  const out: TextRun[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "strong":
        out.push(...runs((t as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case "em":
        out.push(...runs((t as Tokens.Em).tokens, { ...style, italics: true }));
        break;
      case "codespan":
        out.push(new TextRun({ text: (t as Tokens.Codespan).text, font: "Consolas", ...style }));
        break;
      case "link":
        out.push(...runs((t as Tokens.Link).tokens, { ...style }));
        break;
      case "br":
        out.push(new TextRun({ text: "", break: 1 }));
        break;
      default: {
        const nested = (t as { tokens?: Token[] }).tokens;
        if (nested) out.push(...runs(nested, style));
        else out.push(new TextRun({ text: decode((t as { text?: string }).text ?? t.raw), bold: style.bold, italics: style.italics, font: style.code ? "Consolas" : undefined }));
      }
    }
  }
  return out;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function blocks(tokens: Token[], depth = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        out.push(new Paragraph({ heading: HEADINGS[Math.min(5, h.depth - 1)], children: runs(h.tokens) }));
        break;
      }
      case "paragraph":
        out.push(new Paragraph({ children: runs((t as Tokens.Paragraph).tokens), spacing: { after: 120 } }));
        break;
      case "list": {
        const l = t as Tokens.List;
        l.items.forEach((item, i) => {
          const [first, ...rest] = item.tokens;
          const inline = first && "tokens" in first ? runs((first as Tokens.Text).tokens ?? [first]) : [new TextRun(item.text)];
          out.push(
            new Paragraph({
              children: l.ordered ? [new TextRun(`${(Number(l.start) || 1) + i}. `), ...inline] : inline,
              bullet: l.ordered ? undefined : { level: Math.min(depth, 8) },
              indent: l.ordered ? { left: 360 * (depth + 1) } : undefined,
            }),
          );
          out.push(...blocks(rest.filter((x) => x.type === "list"), depth + 1));
        });
        break;
      }
      case "code":
        for (const line of (t as Tokens.Code).text.split("\n")) {
          out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })], shading: { fill: "F1F5F9" } }));
        }
        break;
      case "blockquote":
        out.push(...blocks((t as Tokens.Blockquote).tokens, depth).map((p) => p));
        break;
      case "table": {
        const tb = t as Tokens.Table;
        const cell = (c: Tokens.TableCell, header: boolean) =>
          new TableCell({
            children: [new Paragraph({ children: runs(c.tokens, { bold: header }) })],
            shading: header ? { fill: "06304A", color: "FFFFFF" } : undefined,
          });
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ tableHeader: true, children: tb.header.map((c) => cell(c, true)) }), ...tb.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) }))],
          }),
        );
        out.push(new Paragraph({ text: "" }));
        break;
      }
      case "hr":
        out.push(new Paragraph({ text: "", border: { bottom: { color: "CBD5E1", style: "single", size: 6, space: 1 } } }));
        break;
    }
  }
  return out;
}

export async function markdownToDocx(md: string, title: string): Promise<Buffer> {
  const doc = new Document({
    creator: "Agent Desk",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        children: [
          new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: "Agent Desk", color: "F07A06", bold: true, size: 18 })] }),
          ...blocks(marked.lexer(md)),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/* ----------------------------------------------------------------- html */

export function markdownToHtml(md: string, title: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title></head><body>${marked.parse(md, { async: false })}</body></html>`;
}

/* ------------------------------------------------------------------ zip */

export const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "hasil";

export async function filesToZip(files: { path: string; data: string | Buffer }[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
