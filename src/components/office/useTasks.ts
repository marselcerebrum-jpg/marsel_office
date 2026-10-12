"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOffice, type TaskDetail, type TaskMessage } from "./store";

export type ProviderInfo = { id: string; label: string; models: string[] };

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

let providersCache: Promise<ProviderInfo[]> | null = null;
export function useProviders() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  useEffect(() => {
    providersCache ??= api<{ providers: ProviderInfo[] }>("/api/providers").then((d) => d.providers);
    providersCache.then(setProviders).catch(() => setProviders([]));
  }, []);
  return providers;
}

/** Pilihan model terakhir diingat per perangkat. */
export function useModelChoice(providers: ProviderInfo[] | null) {
  const [picked, setPicked] = useState<{ provider: string; model: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("office-model") ?? "null");
    } catch {
      return null;
    }
  });
  const choice = useMemo(() => {
    if (!providers?.length) return null;
    const valid = picked && providers.some((p) => p.id === picked.provider && p.models.includes(picked.model));
    return valid ? picked : { provider: providers[0].id, model: providers[0].models[0] };
  }, [providers, picked]);
  const update = (c: { provider: string; model: string }) => {
    setPicked(c);
    try {
      localStorage.setItem("office-model", JSON.stringify(c));
    } catch {}
  };
  return [choice, update] as const;
}

export type TaskSummary = TaskDetail;

const RUNNING = ["routing", "gathering", "meeting"];

/**
 * Daftar tugas (dipoll) + langganan event untuk tugas yang sedang difokuskan.
 * Tugas fokus menggerakkan ruang rapat 3D dan panel transkrip.
 */
export function useTaskSync(meId: number) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const focusedId = useOffice((s) => s.task?.id ?? null);
  const esRef = useRef<EventSource | null>(null);
  const autoFocused = useRef(false);

  const focus = useCallback((id: number | null) => {
    esRef.current?.close();
    esRef.current = null;
    const st = useOffice.getState();
    st.setSpeaking(null);
    if (id === null) {
      st.setTask(null);
      return;
    }
    const es = new EventSource(`/api/tasks/${id}/events`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      const s = useOffice.getState();
      switch (e.type) {
        case "snapshot": {
          s.setTask(e.task as TaskDetail, e.messages as TaskMessage[]);
          const live = (e.messages as TaskMessage[]).find((m) => m.streaming);
          s.setSpeaking(live?.agentId ?? null);
          break;
        }
        case "status":
          s.patchTask(e.participants ? { status: e.status, participants: e.participants } : { status: e.status });
          if (!RUNNING.includes(e.status)) s.setSpeaking(null);
          setTasks((list) => list.map((t) => (t.id === id ? { ...t, status: e.status } : t)));
          break;
        case "message_start":
          s.setMessages((m) => [...m, { id: e.id, revision: e.revision, kind: e.kind, agentId: e.agentId, content: "", streaming: true }]);
          s.setSpeaking(e.agentId);
          break;
        case "delta":
          s.setMessages((m) => m.map((x) => (x.id === e.id ? { ...x, content: x.content + e.text } : x)));
          break;
        case "message_end":
          s.setMessages((m) => m.map((x) => (x.id === e.id ? { ...x, streaming: false } : x)));
          s.setSpeaking(null);
          break;
        case "result":
          s.patchTask({ result: e.content });
          break;
        case "error":
          s.patchTask({ error: e.message });
          break;
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ tasks: TaskSummary[] }>("/api/tasks");
      setTasks(d.tasks);
      // Fokus otomatis ke rapat yang sedang berjalan (milik siapa pun) bila belum ada fokus.
      const st = useOffice.getState();
      const running = d.tasks.find((t) => RUNNING.includes(t.status));
      if (running && (!st.task || !RUNNING.includes(st.task.status)) && st.task?.id !== running.id) {
        focus(running.id);
      } else if (!st.task && !autoFocused.current) {
        const mine = d.tasks.find((t) => t.status === "review" && t.userId === meId);
        if (mine) focus(mine.id);
      }
      autoFocused.current = true;
    } catch {
      /* diam: poll berikutnya mencoba lagi */
    }
  }, [meId, focus]);


  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 8000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      esRef.current?.close();
    };
  }, [refresh]);

  return { tasks, refresh, focus, focusedId };
}

export const STATUS_LABEL: Record<string, string> = {
  routing: "Memilih peserta",
  gathering: "Lead menuju ruang rapat",
  meeting: "Rapat berlangsung",
  review: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  failed: "Gagal",
};

export const STATUS_STYLE: Record<string, string> = {
  routing: "bg-sky-100 text-sky-800",
  gathering: "bg-sky-100 text-sky-800",
  meeting: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-green-600 text-white",
  rejected: "bg-slate-300 text-slate-700",
  failed: "bg-red-100 text-red-800",
};
