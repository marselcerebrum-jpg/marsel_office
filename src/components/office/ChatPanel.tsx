"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "@/lib/types";
import { ModelSelect, NoProviderNote } from "./TaskUI";
import { api, useModelChoice, useProviders } from "./useTasks";

type Msg = { id: number | string; role: "user" | "assistant"; content: string; streaming?: boolean };
type Conv = { id: number; title: string; updatedAt: string };

export function ChatPanel({ agent, onBack }: { agent: Agent; onBack: () => void }) {
  const providers = useProviders();
  const [model, setModel] = useModelChoice(providers);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ conversations: Conv[] }>(`/api/conversations?agentId=${agent.id}`)
      .then((d) => setConvs(d.conversations))
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, [agent.id]);

  useEffect(() => {
    // scrollIntoView kini mengembalikan Promise di Chromium baru; jangan jadikan nilai balik effect.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const openConv = async (id: number | null) => {
    abortRef.current?.abort();
    setConvId(id);
    if (id === null) return setMessages([]);
    const d = await api<{ messages: Msg[] }>(`/api/conversations/${id}`);
    setMessages(d.messages);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !model) return;
    setInput("");
    setBusy(true);
    const replyId = `r-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: text }, { id: replyId, role: "assistant", content: "", streaming: true }]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, agentId: agent.id, provider: model.provider, model: model.model, message: text }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const newId = Number(res.headers.get("X-Conversation-Id"));
      if (!convId && newId) {
        setConvId(newId);
        setConvs((c) => [{ id: newId, title: text.slice(0, 60), updatedAt: new Date().toISOString() }, ...c]);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + chunk } : x)));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: `_(Gagal: ${(e as Error).message})_` } : x)));
      }
    } finally {
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, streaming: false } : x)));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm">
        <button onClick={onBack} className="rounded px-1.5 text-slate-500 hover:bg-slate-100" aria-label="Kembali ke profil">
          ←
        </button>
        <select
          value={convId ?? ""}
          onChange={(e) => openConv(e.target.value ? Number(e.target.value) : null)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1"
        >
          <option value="">+ Percakapan baru</option>
          {convs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {providers && providers.length > 0 && <ModelSelect providers={providers} value={model} onChange={setModel} />}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {providers?.length === 0 && <NoProviderNote />}
        {messages.length === 0 && (
          <div className="rounded-xl bg-slate-50 p-4 text-slate-600">
            <div className="text-2xl">{agent.emoji}</div>
            <p className="mt-1">
              Halo! Saya <b>{agent.name}</b>, {agent.roleId?.toLowerCase()}. Ada yang bisa saya bantu? Saya akan menjawab dalam Bahasa Indonesia.
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-amber-500 px-3 py-2 text-white">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="mr-6 flex gap-2">
              <span className="mt-1 text-lg">{agent.emoji}</span>
              <div className="prompt-md min-w-0 flex-1 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[13px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                {m.streaming && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-amber-500 align-middle" />}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-slate-200 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={`Tulis pesan untuk ${agent.name}… (Enter kirim, Shift+Enter baris baru)`}
          className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        {busy ? (
          <button onClick={() => abortRef.current?.abort()} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white">
            Stop
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim() || !model} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            Kirim
          </button>
        )}
      </div>
    </div>
  );
}
