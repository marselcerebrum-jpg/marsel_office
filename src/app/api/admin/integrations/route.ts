import { apiUser, handle } from "@/lib/auth";
import { listIntegrations, saveIntegration } from "@/lib/work";
import { parseIntegration } from "./parse";

export const GET = handle(async () => {
  await apiUser({ admin: true });
  // Nilai header (mis. token) tidak dikirim balik ke browser; hanya namanya.
  const integrations = listIntegrations().map((i) => ({ ...i, headers: Object.keys(i.headers) }));
  return Response.json({ integrations });
});

export const POST = handle(async (req: Request) => {
  await apiUser({ admin: true });
  const parsed = parseIntegration(await req.json());
  if ("error" in parsed) return Response.json(parsed, { status: 400 });
  try {
    return Response.json({ id: saveIntegration(parsed) });
  } catch {
    return Response.json({ error: "Slug sudah dipakai" }, { status: 409 });
  }
});
