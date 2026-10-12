import { apiUser, handle } from "@/lib/auth";
import { getAgent, getAgentBody } from "@/lib/agents-server";
import { db } from "@/lib/db";
import { assertModel, LANGUAGE_RULE, streamText, type Provider } from "@/lib/llm";

const HISTORY_LIMIT = 40;

/** Chat 1-on-1 dengan agen. Balasan dialirkan sebagai teks biasa; ID percakapan di header. */
export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const b = (await req.json()) as { conversationId?: number; agentId?: string; provider?: string; model?: string; message?: string };
  const message = b.message?.trim();
  if (!message) return Response.json({ error: "Pesan kosong" }, { status: 400 });
  const conn = db();

  let conv: { id: number; agent_id: string; provider: string; model: string } | undefined;
  if (b.conversationId) {
    conv = conn.prepare("SELECT id, agent_id, provider, model FROM conversations WHERE id = ? AND user_id = ?").get(b.conversationId, user.id) as typeof conv;
    if (!conv) return Response.json({ error: "Percakapan tidak ditemukan" }, { status: 404 });
  } else {
    if (!b.agentId || !getAgent(b.agentId)) return Response.json({ error: "Agen tidak ditemukan" }, { status: 400 });
    if (!b.provider || !b.model) return Response.json({ error: "Pilih model AI" }, { status: 400 });
    await assertModel(b.provider, b.model);
    const title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
    const r = conn
      .prepare("INSERT INTO conversations (user_id, agent_id, provider, model, title) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, b.agentId, b.provider, b.model, title);
    conv = { id: Number(r.lastInsertRowid), agent_id: b.agentId, provider: b.provider, model: b.model };
  }
  // Model boleh diganti di tengah percakapan.
  if (b.provider && b.model && (b.provider !== conv.provider || b.model !== conv.model)) {
    await assertModel(b.provider, b.model);
    conn.prepare("UPDATE conversations SET provider = ?, model = ? WHERE id = ?").run(b.provider, b.model, conv.id);
    conv.provider = b.provider;
    conv.model = b.model;
  }

  conn.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)").run(conv.id, message);
  const history = (
    conn.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?").all(conv.id, HISTORY_LIMIT) as {
      role: "user" | "assistant";
      content: string;
    }[]
  ).reverse();
  // Riwayat harus diawali pesan user.
  while (history.length && history[0].role !== "user") history.shift();

  const agent = getAgent(conv.agent_id)!;
  const system = `${getAgentBody(agent.id) ?? ""}${LANGUAGE_RULE}\n\n---\nKONTEKS: Anda sedang mengobrol langsung dengan ${user.name}, anggota tim di Agent Desk.`;
  const encoder = new TextEncoder();
  const convId = conv.id;
  const provider = conv.provider as Provider;
  const model = conv.model;

  const stream = new ReadableStream({
    async start(controller) {
      let text = "";
      try {
        text = await streamText(provider, {
          model,
          system,
          messages: history,
          maxTokens: 16000,
          effort: "medium",
          signal: req.signal,
          onDelta: (t) => controller.enqueue(encoder.encode(t)),
        });
      } catch (e) {
        if (!req.signal.aborted) {
          const note = `\n\n_(Gagal menghubungi model: ${e instanceof Error ? e.message : String(e)})_`;
          text += note;
          controller.enqueue(encoder.encode(note));
        }
      } finally {
        if (text.trim()) {
          conn.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)").run(convId, text);
        }
        conn.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Conversation-Id": String(convId) },
  });
});
