import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Agent, Division, Runbook } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

let agentsCache: Agent[] | null = null;
let bodiesCache: Record<string, string> | null = null;

export function getAgents(): Agent[] {
  agentsCache ??= readJson<Agent[]>("agents.json");
  return agentsCache;
}

export function getAgent(id: string): Agent | undefined {
  return getAgents().find((a) => a.id === id);
}

export function getAgentBody(id: string): string | undefined {
  bodiesCache ??= readJson<Record<string, string>>("agent-bodies.json");
  return bodiesCache[id];
}

export function getDivisions(): Division[] {
  return readJson<Division[]>("divisions.json");
}

export function getRunbooks(): Runbook[] {
  return readJson<Runbook[]>("runbooks.json");
}
