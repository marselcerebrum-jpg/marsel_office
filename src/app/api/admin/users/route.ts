import { apiUser, createUser, handle } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = handle(async () => {
  await apiUser({ admin: true });
  const users = db().prepare("SELECT id, username, name, role, active, created_at AS createdAt FROM users ORDER BY id").all();
  return Response.json({ users });
});

export const POST = handle(async (req: Request) => {
  await apiUser({ admin: true });
  const b = (await req.json()) as { username?: string; name?: string; password?: string; role?: string };
  const username = b.username?.trim() ?? "";
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return Response.json({ error: "Username 3–32 karakter: huruf, angka, titik, minus, garis bawah" }, { status: 400 });
  }
  if (!b.name?.trim()) return Response.json({ error: "Nama wajib diisi" }, { status: 400 });
  if (!b.password || b.password.length < 8) return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  try {
    const id = createUser({ username, name: b.name, password: b.password, role: b.role === "admin" ? "admin" : "member" });
    return Response.json({ id });
  } catch {
    return Response.json({ error: "Username sudah dipakai" }, { status: 409 });
  }
});
