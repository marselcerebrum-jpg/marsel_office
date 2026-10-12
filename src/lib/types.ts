export type QualityFlag = {
  code: "stub" | "no-h1" | "no-vibe" | "garbled-emoji" | "external-deps" | "very-long";
  label: string;
  severity: "info" | "warn" | "error";
};

export type RunbookRef = { slug: string; title: string; group: string };

export type Agent = {
  id: string;
  slug: string;
  name: string;
  division: string;
  subgroup: string | null;
  sourcePath: string;
  emoji: string;
  color: string;
  description: string;
  vibe: string;
  descriptionId: string | null;
  vibeId: string | null;
  roleId: string | null;
  tools: string[];
  services: { name: string; url?: string; tier?: string }[];
  words: number;
  sections: string[];
  regions: Region[];
  flags: QualityFlag[];
  runbooks: RunbookRef[];
};

export type Region = "global" | "china" | "us" | "korea" | "france";

export type Division = { id: string; label: string; icon: string; color: string };

export type Runbook = {
  slug: string;
  title: string;
  mode: string;
  duration?: string;
  summary?: string;
  roster: { group: string; activation?: string; agents: string[] }[];
};

export const REGION_LABELS: Record<Region, string> = {
  global: "Global",
  china: "Pasar China",
  us: "Amerika Serikat",
  korea: "Korea",
  france: "Prancis",
};

export const DIVISION_LABELS_ID: Record<string, string> = {
  academic: "Akademik",
  design: "Desain",
  engineering: "Engineering",
  finance: "Keuangan",
  "game-development": "Pengembangan Game",
  gis: "GIS & Pemetaan",
  healthcare: "Kesehatan",
  marketing: "Marketing",
  "paid-media": "Iklan Berbayar",
  product: "Produk",
  "project-management": "Manajemen Proyek",
  research: "Riset",
  sales: "Sales",
  security: "Keamanan",
  "spatial-computing": "Spatial Computing",
  specialized: "Spesialis",
  support: "Operasional & Dukungan",
  testing: "Testing & QA",
};
