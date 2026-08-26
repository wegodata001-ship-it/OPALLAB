import { Sidebar } from "@/components/layout/sidebar";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PageTransitionLoader } from "@/components/layout/page-transition-loader";
import { DashboardContent } from "@/components/layout/dashboard-content";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PageTransitionLoader />
      <div className="min-h-screen bg-slate-50/80">
        <Sidebar />
        <main className="lg:mr-56 min-h-screen overflow-x-hidden">
          <DashboardContent>{children}</DashboardContent>
        </main>
      </div>
    </AuthGuard>
  );
}

export { Header } from "@/components/layout/sidebar";
