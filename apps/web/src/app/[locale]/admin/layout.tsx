import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/kapsam", label: "Kaynak kapsamı" },
  { href: "/admin/tenders", label: "İhaleler" },
  { href: "/admin/eleme", label: "Elenenler" },
  { href: "/admin/sozluk", label: "Sözlük" },
  { href: "/admin/clusters", label: "Cluster'lar" },
  { href: "/admin/sources", label: "Kaynaklar" },
  { href: "/admin/runs", label: "Çekim kayıtları" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // Admin is invisible to non-admins: 404, not 403.
  if (!user || user.role !== "admin") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/admin/sources" className="text-sm font-semibold">
            Tenderlist Admin
          </Link>
          <nav className="flex gap-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-neutral-600 hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
