import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export type User = { id: number; username: string; name: string; role: "admin" | "member" };

const COOKIE = "office_session";
const SESSION_DAYS = 30;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Buat admin pertama dari env bila tabel users masih kosong. */
export function ensureBootstrapAdmin() {
  const conn = db();
  const { n } = conn.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return;
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn("[auth] Belum ada user. Set ADMIN_PASSWORD untuk membuat akun admin pertama.");
    return;
  }
  createUser({ username, name: process.env.ADMIN_NAME ?? "Administrator", password, role: "admin" });
  console.log(`[auth] Akun admin "${username}" dibuat.`);
}

export function createUser(u: { username: string; name: string; password: string; role: "admin" | "member" }) {
  const hash = bcrypt.hashSync(u.password, 10);
  const r = db()
    .prepare("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(u.username.trim(), u.name.trim(), hash, u.role);
  return Number(r.lastInsertRowid);
}

export function verifyLogin(username: string, password: string): User | null {
  ensureBootstrapAdmin();
  const row = db()
    .prepare("SELECT id, username, name, role, password_hash, active FROM users WHERE username = ?")
    .get(username.trim()) as (User & { password_hash: string; active: number }) | undefined;
  if (!row || !row.active || !bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db().prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(token), userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(hashToken(token), new Date().toISOString()) as User | undefined;
  // Baris node:sqlite berprototipe null; salin ke objek biasa agar bisa dikirim ke Client Component.
  return row ? { id: row.id, username: row.username, name: row.name, role: row.role } : null;
}

/** Untuk halaman: alihkan ke /login bila belum masuk. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Untuk route handler: lempar Response 401/403 yang langsung dikembalikan. */
export async function apiUser(opts?: { admin?: boolean }): Promise<User> {
  const u = await currentUser();
  if (!u) throw Response.json({ error: "Silakan masuk dulu" }, { status: 401 });
  if (opts?.admin && u.role !== "admin") throw Response.json({ error: "Khusus admin" }, { status: 403 });
  return u;
}

/** Bungkus handler agar Response yang dilempar apiUser dikembalikan apa adanya. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Terjadi kesalahan" }, { status: 500 });
    }
  };
}
