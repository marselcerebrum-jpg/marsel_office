import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser, ensureBootstrapAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  ensureBootstrapAdmin();
  if (await currentUser()) redirect("/");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-[#06304A] via-[#0B3F5E] to-[#7A3A05] p-4">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#f07a06_0,transparent_40%),radial-gradient(circle_at_80%_70%,#fdb943_0,transparent_35%)]" />
      <div className="relative w-full max-w-sm rounded-3xl bg-white/95 p-7 shadow-2xl backdrop-blur">
        <div className="text-center">
          <h1>
            <Image src="/brand/agent-desk-logo.png" alt="Agent Desk" width={1364} height={474} priority className="mx-auto h-auto w-56" />
          </h1>
          <p className="mt-1 text-sm text-slate-500">Kantor virtual 282 spesialis AI. Masuk untuk mulai memberi tugas.</p>
        </div>
        <LoginForm />
        <p className="mt-5 text-center text-xs text-slate-400">Akun dibuat oleh admin tim. Hubungi admin bila belum punya akun.</p>
      </div>
    </main>
  );
}
