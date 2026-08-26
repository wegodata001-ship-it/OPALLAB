import { AuthGuard } from "@/components/layout/auth-guard";
import { PageTransitionLoader } from "@/components/layout/page-transition-loader";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PageTransitionLoader />
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}

export { Header } from "@/components/layout/sidebar";
