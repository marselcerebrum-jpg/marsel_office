import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AdminTabs } from "./AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return (
    <main className="min-h-dvh bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/brand/agent-desk-mark.png" alt="Agent Desk" width={554} height={464} className="h-11 w-auto" />
            <div>
            <h1 className="text-2xl font-black">Pengaturan Admin</h1>
            <p className="text-sm text-slate-500">Kelola akun tim dan sambungan ke aplikasi internal.</p>
            </div>
          </div>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-50">
            ← Kembali ke kantor
          </Link>
        </div>
        <AdminTabs meId={user.id} />
      </div>
    </main>
  );
}
