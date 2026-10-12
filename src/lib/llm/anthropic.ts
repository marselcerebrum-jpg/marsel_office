import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { StreamRequest } from "./index";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

/** Model yang mendukung `fallbacks: "default"` (Claude API, beta server-side-fallback-2026-07-01). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"]);

export function anthropicModels(): string[] {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  return (process.env.ANTHROPIC_MODELS ?? "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export async function streamAnthropic(req: StreamRequest): Promise<string> {
  const useFallback = FALLBACK_MODELS.has(req.model);
  const params = {
    model: req.model,
    max_tokens: req.maxTokens ?? 16000,
    // Prompt agen panjang dan tidak berubah antar giliran: cache agar giliran berikutnya murah.
    system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    output_config: { effort: req.effort ?? "medium" },
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };

  // `fallbacks: "default"` belum ada di typing SDK; kirim lewat beta endpoint apa adanya.
  const stream = getClient().beta.messages.stream(params as Parameters<Anthropic["beta"]["messages"]["stream"]>[0], {
    signal: req.signal,
  });

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      req.onDelta?.(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    const note = "\n\n_(Permintaan ini ditolak oleh filter keamanan model.)_";
    text += note;
    req.onDelta?.(note);
  } else if (final.stop_reason === "max_tokens") {
    const note = "\n\n_(Jawaban terpotong karena batas panjang.)_";
    text += note;
    req.onDelta?.(note);
  }
  return text;
}
