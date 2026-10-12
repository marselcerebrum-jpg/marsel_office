import type { Integration } from "@/lib/work";

type Input = Partial<Record<"slug" | "name" | "description" | "url" | "method" | "headers" | "inputExample", string>> & {
  autoApprove?: boolean;
  active?: boolean;
};

/** Validasi isian integrasi dari form admin. `headers` ditulis satu per baris: "Nama: nilai". */
export function parseIntegration(b: Input, keepHeaders?: Record<string, string>): Omit<Integration, "id"> | { error: string } {
  const slug = (b.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return { error: "Slug: huruf kecil, angka, dan tanda minus (2–40 karakter)" };
  if (!b.name?.trim()) return { error: "Nama wajib diisi" };
  if (!b.description || b.description.trim().length < 10) return { error: "Jelaskan fungsi integrasi untuk agen (min. 10 karakter)" };
  let url: URL;
  try {
    url = new URL((b.url ?? "").trim());
  } catch {
    return { error: "URL tidak valid" };
  }
  if (!["http:", "https:"].includes(url.protocol)) return { error: "URL harus http(s)" };
  const method = (b.method ?? "POST").toUpperCase();
  if (!["POST", "PUT", "PATCH", "GET"].includes(method)) return { error: "Metode tidak didukung" };
  let headers: Record<string, string> = {};
  if (!b.headers?.trim() && keepHeaders) headers = keepHeaders;
  else {
    for (const line of (b.headers ?? "").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const inputExample = (b.inputExample ?? "{}").trim() || "{}";
  try {
    JSON.parse(inputExample);
  } catch {
    return { error: "Contoh input harus JSON yang valid" };
  }
  return {
    slug,
    name: b.name.trim(),
    description: b.description.trim(),
    url: url.toString(),
    method,
    headers,
    inputExample,
    autoApprove: !!b.autoApprove,
    active: b.active !== false,
  };
}
