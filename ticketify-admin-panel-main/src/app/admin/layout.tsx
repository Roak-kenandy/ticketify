import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminProtection } from "@/components/admin/admin-protection";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProtection>
      <div className="min-h-screen bg-background text-foreground">
        <AdminNavigation />
        <main className="lg:ml-64 p-6 overflow-scroll max-h-[calc(100vh-20px)] ">
          {children}
        </main>
      </div>
    </AdminProtection>
  );
}
