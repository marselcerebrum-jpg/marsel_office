import { create } from "zustand";
import type { Region } from "@/lib/types";

export type Filters = {
  query: string;
  divisions: Set<string>;
  regions: Set<Region>;
  onlyIssues: boolean;
  runbook: string | null;
};

type OfficeState = {
  selectedId: string | null;
  hoveredId: string | null;
  nearbyIds: string[];
  filters: Filters;
  /** Titik tujuan jalan otomatis (klik lantai / klik agen). */
  walkTarget: { x: number; z: number } | null;
  /** Teleport sekali jalan; dikonsumsi oleh Player. */
  teleport: { x: number; z: number } | null;
  playerPos: { x: number; z: number };
  catalogOpen: boolean;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setNearby: (ids: string[]) => void;
  setFilters: (patch: Partial<Filters>) => void;
  walkTo: (p: { x: number; z: number } | null) => void;
  teleportTo: (p: { x: number; z: number }) => void;
  consumeTeleport: () => void;
  setPlayerPos: (p: { x: number; z: number }) => void;
  setCatalogOpen: (v: boolean) => void;
};

export const useOffice = create<OfficeState>((set) => ({
  selectedId: null,
  hoveredId: null,
  nearbyIds: [],
  filters: { query: "", divisions: new Set(), regions: new Set(), onlyIssues: false, runbook: null },
  walkTarget: null,
  teleport: null,
  playerPos: { x: 0, z: 0 },
  catalogOpen: true,
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setNearby: (ids) => set({ nearbyIds: ids }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  walkTo: (p) => set({ walkTarget: p }),
  teleportTo: (p) => set({ teleport: p, walkTarget: null }),
  consumeTeleport: () => set({ teleport: null }),
  setPlayerPos: (p) => set({ playerPos: p }),
  setCatalogOpen: (v) => set({ catalogOpen: v }),
}));
