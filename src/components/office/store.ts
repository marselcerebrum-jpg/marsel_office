import { create } from "zustand";
import type { Region } from "@/lib/types";
import type { FloorId } from "./building";

export type Filters = {
  query: string;
  divisions: Set<string>;
  regions: Set<Region>;
  onlyIssues: boolean;
  runbook: string | null;
};

export type Quality = "tinggi" | "sedang" | "rendah";
export type Panel = null | "compose" | "tasks" | "task" | "chat";

export type TaskStatus =
  | "routing" | "gathering" | "meeting" | "review" | "approved" | "rejected" | "failed"
  | "planning" | "executing" | "delivered" | "done";

export type DeliverableType = "document" | "report" | "content" | "spreadsheet" | "code";
export type Deliverable = {
  id: number;
  key: string;
  title: string;
  type: DeliverableType;
  assignee: string;
  instructions: string;
  dependsOn: string[];
  status: "pending" | "working" | "qa" | "revising" | "done" | "failed";
  content: string;
  qaNotes: string | null;
  attempts: number;
  revisionNote: string | null;
  position: number;
};

export type ActionRequest = {
  id: number;
  deliverableId: number | null;
  agentId: string;
  integration: string;
  input: unknown;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "done" | "failed";
  result: string | null;
  createdAt: string;
};

export type TaskMessage = {
  id: number;
  revision: number;
  kind: "brief" | "agent" | "summary" | "review" | "system";
  agentId: string | null;
  content: string;
  streaming?: boolean;
};

export type TaskDetail = {
  id: number;
  userId: number;
  userName: string;
  title: string;
  brief: string;
  status: TaskStatus;
  routing: "auto" | "manual";
  provider: string;
  model: string;
  participants: string[];
  result: string | null;
  reviewNote: string | null;
  revision: number;
  error: string | null;
  createdAt: string;
};

type OfficeState = {
  selectedId: string | null;
  hoveredId: string | null;
  nearbyIds: string[];
  filters: Filters;
  walkTarget: { x: number; z: number; floor: FloorId } | null;
  teleport: { x: number; z: number; floor: FloorId } | null;
  playerPos: { x: number; z: number; floor: FloorId };
  viewFloor: FloorId;
  catalogOpen: boolean;
  quality: Quality;
  panel: Panel;
  nearTaskDesk: boolean;

  /** Tugas yang sedang ditampilkan di ruang rapat 3D + panel. */
  task: TaskDetail | null;
  messages: TaskMessage[];
  deliverables: Deliverable[];
  actions: ActionRequest[];
  speakingId: string | null;
  /** Agen yang sedang tidak di mejanya (berjalan / di ruang rapat). */
  awayIds: Set<string>;
  /** Agen yang langsung diundang saat formulir tugas dibuka dari profil. */
  composeSeed: string[];

  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setNearby: (ids: string[]) => void;
  setFilters: (patch: Partial<Filters>) => void;
  walkTo: (p: { x: number; z: number; floor: FloorId } | null) => void;
  teleportTo: (p: { x: number; z: number; floor: FloorId }) => void;
  consumeTeleport: () => void;
  setPlayerPos: (p: { x: number; z: number; floor: FloorId }) => void;
  setViewFloor: (f: FloorId) => void;
  setCatalogOpen: (v: boolean) => void;
  setQuality: (q: Quality) => void;
  openPanel: (p: Panel) => void;
  setNearTaskDesk: (v: boolean) => void;
  setTask: (t: TaskDetail | null, messages?: TaskMessage[], deliverables?: Deliverable[], actions?: ActionRequest[]) => void;
  upsertDeliverable: (d: Deliverable) => void;
  appendDeliverable: (id: number, text: string) => void;
  upsertAction: (a: ActionRequest) => void;
  patchTask: (patch: Partial<TaskDetail>) => void;
  setMessages: (fn: (m: TaskMessage[]) => TaskMessage[]) => void;
  setSpeaking: (id: string | null) => void;
  setAway: (ids: Set<string>) => void;
  inviteToMeeting: (agentId: string) => void;
};

function initialQuality(): Quality {
  try {
    const q = localStorage.getItem("office-quality");
    if (q === "tinggi" || q === "sedang" || q === "rendah") return q;
  } catch {}
  return "sedang";
}

export const useOffice = create<OfficeState>((set) => ({
  selectedId: null,
  hoveredId: null,
  nearbyIds: [],
  filters: { query: "", divisions: new Set(), regions: new Set(), onlyIssues: false, runbook: null },
  walkTarget: null,
  teleport: null,
  playerPos: { x: 0, z: 0, floor: 0 },
  viewFloor: 0,
  catalogOpen: false,
  quality: typeof window === "undefined" ? "sedang" : initialQuality(),
  panel: null,
  nearTaskDesk: false,
  task: null,
  messages: [],
  deliverables: [],
  actions: [],
  speakingId: null,
  awayIds: new Set(),
  composeSeed: [],

  select: (id) => set((s) => ({ selectedId: id, panel: id && s.panel === "chat" ? "chat" : s.panel === "chat" ? null : s.panel })),
  hover: (id) => set({ hoveredId: id }),
  setNearby: (ids) => set({ nearbyIds: ids }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  walkTo: (p) => set({ walkTarget: p }),
  teleportTo: (p) => set({ teleport: p, walkTarget: null }),
  consumeTeleport: () => set({ teleport: null }),
  setPlayerPos: (p) => set({ playerPos: p }),
  setViewFloor: (f) => set({ viewFloor: f }),
  setCatalogOpen: (v) => set({ catalogOpen: v }),
  setQuality: (q) => {
    try {
      localStorage.setItem("office-quality", q);
    } catch {}
    set({ quality: q });
  },
  openPanel: (p) => set((st) => ({ panel: p, composeSeed: p === "compose" && st.panel !== "compose" ? st.composeSeed : [] })),
  setNearTaskDesk: (v) => set({ nearTaskDesk: v }),
  setTask: (t, messages, deliverables, actions) => set({ task: t, messages: messages ?? [], deliverables: deliverables ?? [], actions: actions ?? [] }),
  // Saat mulai/ulang ditulis, isi dikosongkan lalu diisi lagi oleh potongan teks (d_delta).
  upsertDeliverable: (d) =>
    set((s) => {
      const next = { ...d, content: d.status === "working" || d.status === "revising" ? "" : d.content };
      const list = s.deliverables.some((x) => x.id === d.id) ? s.deliverables.map((x) => (x.id === d.id ? next : x)) : [...s.deliverables, next];
      return { deliverables: list.sort((x, y) => x.position - y.position || x.id - y.id) };
    }),
  appendDeliverable: (id, text) => set((s) => ({ deliverables: s.deliverables.map((x) => (x.id === id ? { ...x, content: x.content + text } : x)) })),
  upsertAction: (a) => set((s) => ({ actions: s.actions.some((x) => x.id === a.id) ? s.actions.map((x) => (x.id === a.id ? a : x)) : [...s.actions, a] })),
  patchTask: (patch) => set((s) => (s.task ? { task: { ...s.task, ...patch } } : {})),
  setMessages: (fn) => set((s) => ({ messages: fn(s.messages) })),
  setSpeaking: (id) => set({ speakingId: id }),
  setAway: (ids) => set({ awayIds: ids }),
  inviteToMeeting: (agentId) => set({ composeSeed: [agentId], panel: "compose" }),
}));
