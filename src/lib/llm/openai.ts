import "server-only";
import OpenAI from "openai";
import type { StreamRequest } from "./index";

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI());

let discovered: { at: number; models: string[] } | null = null;

/**
 * Daftar model GPT: dari OPENAI_MODELS bila diisi, kalau tidak diambil dari
 * endpoint /models akun Anda (disaring ke model chat "gpt-*"), di-cache 1 jam.
 */
export async function openaiModels(): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  const fromEnv = (process.env.OPENAI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  if (discovered && Date.now() - discovered.at < 3600_000) return discovered.models;
  try {
    const ids: string[] = [];
    for await (const m of getClient().models.list()) ids.push(m.id);
    const models = ids
      .filter((id) => /^gpt-/.test(id) && !/(audio|realtime|transcribe|tts|image|search|instruct)/.test(id))
      .sort()
      .reverse();
    discovered = { at: Date.now(), models };
    return models;
  } catch (e) {
    console.error("[openai] gagal mengambil daftar model:", e);
    return [];
  }
}

export async function streamOpenAI(req: StreamRequest): Promise<string> {
  const stream = await getClient().chat.completions.create(
    {
      model: req.model,
      stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    },
    { signal: req.signal },
  );
  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      req.onDelta?.(delta);
    }
  }
  return text;
}
