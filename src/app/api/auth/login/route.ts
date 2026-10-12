import { handle, startSession, verifyLogin } from "@/lib/auth";

export const POST = handle(async (req: Request) => {
  const { username, password } = (await req.json()) as { username?: string; password?: string };
  const user = username && password ? verifyLogin(username, password) : null;
  if (!user) return Response.json({ error: "Username atau password salah" }, { status: 401 });
  await startSession(user.id);
  return Response.json({ user });
});
