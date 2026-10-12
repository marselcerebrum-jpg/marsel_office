import "server-only";
import { anthropicModels, streamAnthropic } from "./anthropic";
import { openaiModels, streamOpenAI } from "./openai";
import { streamMock } from "./mock";

export type Provider = "anthropic" | "openai" | "mock";

export type StreamRequest = {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
};

export type ProviderInfo = { id: Provider; label: string; models: string[] };

export const mockEnabled = () => process.env.LLM_MOCK === "1";

export async function availableProviders(): Promise<ProviderInfo[]> {
  const list: ProviderInfo[] = [];
  const a = anthropicModels();
  if (a.length) list.push({ id: "anthropic", label: "Claude (Anthropic)", models: a });
  const o = await openaiModels();
  if (o.length) list.push({ id: "openai", label: "GPT (OpenAI)", models: o });
  if (mockEnabled()) list.push({ id: "mock", label: "Simulasi (tanpa API)", models: ["simulasi"] });
  return list;
}

export async function assertModel(provider: string, model: string) {
  const p = (await availableProviders()).find((x) => x.id === provider);
  if (!p) throw Response.json({ error: "Penyedia AI belum dikonfigurasi (cek API key di .env)" }, { status: 400 });
  if (!p.models.includes(model)) throw Response.json({ error: `Model ${model} tidak tersedia` }, { status: 400 });
}

/** Aturan bahasa yang ditempel di akhir setiap system prompt agen. */
export const LANGUAGE_RULE =
  "\n\n---\nATURAN BAHASA (wajib): Selalu jawab dalam Bahasa Indonesia yang natural dan profesional, apa pun bahasa pertanyaannya. Istilah teknis atau nama produk boleh tetap dalam bahasa aslinya.";

export function streamText(provider: Provider, req: StreamRequest): Promise<string> {
  switch (provider) {
    case "anthropic":
      return streamAnthropic(req);
    case "openai":
      return streamOpenAI(req);
    case "mock":
      return streamMock(req);
  }
}
