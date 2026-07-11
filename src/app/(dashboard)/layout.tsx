import { Sidebar } from "@/components/layout/sidebar";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PageTransitionLoader } from "@/components/layout/page-transition-loader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PageTransitionLoader />
      <div className="min-h-screen bg-slate-50/80">
        <Sidebar />
        <main className="lg:mr-56 min-h-screen">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}

export { Header } from "@/components/layout/sidebar";
