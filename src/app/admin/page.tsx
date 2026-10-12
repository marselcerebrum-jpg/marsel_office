import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return (
    <main className="min-h-dvh bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">👥 Kelola Tim</h1>
            <p className="text-sm text-slate-500">Hanya admin yang bisa membuat akun. Bagikan username dan password awal ke anggota tim.</p>
          </div>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-50">
            ← Kembali ke kantor
          </Link>
        </div>
        <UsersAdmin meId={user.id} />
      </div>
    </main>
  );
}
