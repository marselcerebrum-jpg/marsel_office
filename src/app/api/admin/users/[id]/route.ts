import bcrypt from "bcryptjs";
import { apiUser, handle } from "@/lib/auth";
import { db } from "@/lib/db";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const me = await apiUser({ admin: true });
  const id = Number((await ctx.params).id);
  const b = (await req.json()) as { name?: string; password?: string; role?: string; active?: boolean };
  const conn = db();
  if (id === me.id && (b.role === "member" || b.active === false)) {
    return Response.json({ error: "Anda tidak bisa menurunkan atau menonaktifkan akun sendiri" }, { status: 400 });
  }
  if (b.name?.trim()) conn.prepare("UPDATE users SET name = ? WHERE id = ?").run(b.name.trim(), id);
  if (b.role === "admin" || b.role === "member") conn.prepare("UPDATE users SET role = ? WHERE id = ?").run(b.role, id);
  if (typeof b.active === "boolean") {
    conn.prepare("UPDATE users SET active = ? WHERE id = ?").run(b.active ? 1 : 0, id);
    if (!b.active) conn.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  if (b.password) {
    if (b.password.length < 8) return Response.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    conn.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(b.password, 10), id);
    conn.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  return Response.json({ ok: true });
});
