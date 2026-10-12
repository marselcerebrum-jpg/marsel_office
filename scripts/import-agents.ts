/**
 * Impor seluruh agen dari repo agency-agents ke data/ aplikasi.
 *
 *   npm run import-agents                 # sumber default: ../agency-agents-main
 *   AGENCY_SOURCE=/path/ke/repo npm run import-agents
 *
 * Menghasilkan:
 *   data/agents.json        metadata semua agen (dipakai client & server)
 *   data/agent-bodies.json  isi prompt lengkap per agen (server saja)
 *   data/divisions.json     daftar divisi
 *   data/runbooks.json      roster runbook NEXUS
 *
 * Terjemahan Indonesia dibaca dari data/translations-id.json (dibuat terpisah)
 * dan digabungkan ke agents.json kalau ada.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = process.cwd();
const SOURCE = path.resolve(ROOT, process.env.AGENCY_SOURCE ?? "../agency-agents-main");
const OUT = path.join(ROOT, "data");
const CUSTOM = path.join(ROOT, "custom-agents");

// Sama dengan resolve_opencode_color() di scripts/convert.sh repo sumber.
const NAMED_COLORS: Record<string, string> = {
  cyan: "#00FFFF", blue: "#3498DB", green: "#2ECC71", red: "#E74C3C",
  purple: "#9B59B6", orange: "#F39C12", teal: "#008080", indigo: "#6366F1",
  pink: "#E84393", gold: "#EAB308", amber: "#F59E0B", "neon-green": "#10B981",
  "neon-cyan": "#06B6D4", "metallic-blue": "#3B82F6", yellow: "#EAB308",
  violet: "#8B5CF6", rose: "#F43F5E", lime: "#84CC16", gray: "#6B7280",
  fuchsia: "#D946EF", slate: "#64748B", navy: "#000080",
};

function resolveColor(raw: unknown, fallback: string): string {
  const c = String(raw ?? "").trim().toLowerCase().replace(/^["']|["']$/g, "");
  const mapped = NAMED_COLORS[c] ?? c;
  if (/^#[0-9a-f]{6}$/i.test(mapped)) return mapped.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(mapped)) return `#${mapped.toUpperCase()}`;
  return fallback;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function splitFrontmatter(text: string): { fm: Record<string, unknown>; body: string } | null {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return null;
  const raw = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^[^\n]*\n/, "");
  try {
    const fm = parseYaml(raw);
    return fm && typeof fm === "object" ? { fm: fm as Record<string, unknown>, body } : null;
  } catch {
    return null;
  }
}

/** Judul markdown di luar blok kode. */
function headings(body: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  let fence: string | null = null;
  for (const line of body.split("\n")) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push({ level: h[1].length, text: h[2].trim() });
  }
  return out;
}

const CHINA_TERMS = /\b(china|chinese|douyin|wechat|weixin|xiaohongshu|baidu|taobao|tmall|bilibili|kuaishou|weibo|zhihu|feishu|lark|huawei|gaussdb|pinduoduo|jd\.com|wecom|mlps|h3c|ruijie|ximalaya|xiaoyuzhou|csdn|juejin|36 stratagems)\b/gi;
const US_TERMS = /\b(fedramp|section 508|uswds|hipaa|irs|nist|ccpa|federal|u\.s\.|united states|mortgage|ada\b)/gi;
const KOREA_TERMS = /\b(korea|korean|kakao|naver|hangul)\b/gi;
const FRANCE_TERMS = /\b(france|french|malt|portage salarial)\b/gi;
const CJK = /[一-鿿]/g;
const HANGUL = /[가-힯]/g;

function regionTags(name: string, description: string, body: string): string[] {
  const head = `${name} ${description}`;
  const tags: string[] = [];
  const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
  if (count(CHINA_TERMS, head) > 0 || count(CJK, body) > 20 || count(CHINA_TERMS, body) > 12) tags.push("china");
  if (count(US_TERMS, head) > 0 || count(US_TERMS, body) > 15) tags.push("us");
  if (count(KOREA_TERMS, head) > 0 || count(HANGUL, body) > 20) tags.push("korea");
  if (count(FRANCE_TERMS, head) > 0) tags.push("france");
  if (tags.length === 0) tags.push("global");
  return tags;
}

type Flag = { code: string; label: string; severity: "info" | "warn" | "error" };

function qualityFlags(fm: Record<string, unknown>, body: string, hs: { level: number; text: string }[], words: number): Flag[] {
  const flags: Flag[] = [];
  if (words < 600) flags.push({ code: "stub", label: "Sangat pendek / kerangka", severity: "warn" });
  if (!hs.some((h) => h.level === 1)) flags.push({ code: "no-h1", label: "Tanpa judul H1", severity: "info" });
  if (!fm.vibe) flags.push({ code: "no-vibe", label: "Field vibe kosong", severity: "info" });
  // Emoji rusak karena encoding: judul diawali karakter Latin-1 seperti "=¨" atau ">à".
  if (hs.some((h) => /^[=<>;:][ -ÿ]/.test(h.text))) {
    flags.push({ code: "garbled-emoji", label: "Emoji judul rusak (encoding)", severity: "error" });
  }
  if (/ai\/memory-bank|ai\/system\/|qa-playwright-capture|17-security-pattern/.test(body)) {
    flags.push({ code: "external-deps", label: "Merujuk file yang tidak ikut di repo", severity: "warn" });
  }
  if (words > 4000) flags.push({ code: "very-long", label: "Prompt sangat panjang", severity: "info" });
  return flags;
}

type Runbook = {
  slug: string; title: string; mode: string; duration?: string; summary?: string;
  roster: { group: string; activation?: string; agents: string[] }[];
};

function main() {
  if (!fs.existsSync(path.join(SOURCE, "divisions.json"))) {
    throw new Error(`Repo sumber tidak ditemukan di ${SOURCE} (set AGENCY_SOURCE)`);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const divisionsJson = JSON.parse(fs.readFileSync(path.join(SOURCE, "divisions.json"), "utf8"));
  const divisions: { id: string; label: string; icon: string; color: string; custom?: boolean; root: string }[] = Object.entries(
    divisionsJson.divisions as Record<string, { label: string; icon: string; color: string }>,
  ).map(([id, d]) => ({ id, ...d, root: SOURCE }));

  // Divisi khusus Agent Desk (mis. Produk Cerebrum) dari folder custom-agents/.
  const customJsonPath = path.join(CUSTOM, "divisions.json");
  if (fs.existsSync(customJsonPath)) {
    const custom = JSON.parse(fs.readFileSync(customJsonPath, "utf8")).divisions as Record<string, { label: string; icon: string; color: string }>;
    for (const [id, d] of Object.entries(custom)) divisions.push({ id, ...d, custom: true, root: CUSTOM });
  }

  const runbooksJson = JSON.parse(fs.readFileSync(path.join(SOURCE, "strategy/runbooks.json"), "utf8"));
  const runbooks: Runbook[] = runbooksJson.runbooks;
  const runbookIndex = new Map<string, { slug: string; title: string; group: string }[]>();
  for (const rb of runbooks) {
    for (const g of rb.roster) {
      for (const a of g.agents) {
        const list = runbookIndex.get(a) ?? [];
        list.push({ slug: rb.slug, title: rb.title, group: g.group });
        runbookIndex.set(a, list);
      }
    }
  }

  const translationsPath = path.join(OUT, "translations-id.json");
  const translations: Record<string, { description?: string; vibe?: string; role?: string }> =
    fs.existsSync(translationsPath) ? JSON.parse(fs.readFileSync(translationsPath, "utf8")) : {};

  const agents = [];
  const bodies: Record<string, string> = {};
  const seen = new Set<string>();

  for (const div of divisions) {
    const dir = path.join(div.root, div.id);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir).sort()) {
      const parsed = splitFrontmatter(fs.readFileSync(file, "utf8"));
      if (!parsed || !parsed.fm.name) continue;
      const { fm, body } = parsed;
      const id = path.basename(file, ".md");
      if (seen.has(id)) throw new Error(`ID agen ganda: ${id}`);
      seen.add(id);

      const name = String(fm.name).trim();
      const description = String(fm.description ?? "").trim();
      const hs = headings(body);
      const words = body.split(/\s+/).filter(Boolean).length;
      const rel = (div.custom ? "custom-agents/" : "") + path.relative(div.root, file).replace(/\\/g, "/");
      const subgroup = rel.split("/").length > 2 ? rel.split("/")[1] : null;
      const tools = typeof fm.tools === "string"
        ? fm.tools.split(",").map((t) => t.trim()).filter(Boolean)
        : Array.isArray(fm.tools) ? fm.tools.map(String) : [];

      agents.push({
        id,
        slug: slugify(name),
        name,
        division: div.id,
        subgroup,
        sourcePath: rel,
        emoji: String(fm.emoji ?? "🤖").trim(),
        color: resolveColor(fm.color, div.color),
        description,
        vibe: fm.vibe ? String(fm.vibe).trim() : "",
        // Agen khusus ditulis langsung dalam Bahasa Indonesia.
        descriptionId: div.custom ? description : translations[id]?.description ?? null,
        vibeId: div.custom ? (fm.vibe ? String(fm.vibe).trim() : null) : translations[id]?.vibe ?? null,
        roleId: div.custom ? (fm.role ? String(fm.role).trim() : null) : translations[id]?.role ?? null,
        custom: !!div.custom,
        app: fm.app ? String(fm.app).trim() : null,
        tools,
        services: Array.isArray(fm.services) ? fm.services : [],
        words,
        sections: hs.filter((h) => h.level <= 2).map((h) => h.text).slice(0, 40),
        regions: div.custom ? ["indonesia"] : regionTags(name, description, body),
        flags: qualityFlags(fm, body, hs, words),
        runbooks: runbookIndex.get(id) ?? [],
      });
      bodies[id] = body;
    }
  }

  const write = (name: string, data: unknown) =>
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, name === "agent-bodies.json" ? 0 : 2) + "\n");

  write("agents.json", agents);
  write("agent-bodies.json", bodies);
  write("divisions.json", divisions.map(({ root: _root, ...d }) => d));
  write("runbooks.json", runbooks.map(({ slug, title, mode, duration, summary, roster }) => ({ slug, title, mode, duration, summary, roster })));

  const translated = agents.filter((a) => a.descriptionId).length;
  console.log(`Diimpor ${agents.length} agen dari ${divisions.length} divisi (${translated} sudah diterjemahkan).`);
  const missing = runbooks.flatMap((r) => r.roster.flatMap((g) => g.agents)).filter((a) => !seen.has(a));
  if (missing.length) console.warn(`Agen runbook tidak ditemukan: ${missing.join(", ")}`);
}

main();
