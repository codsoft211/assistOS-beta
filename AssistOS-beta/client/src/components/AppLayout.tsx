import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./bottom-nav";
import { WelcomeBanner } from "./WelcomeBanner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useLocation } from "wouter";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };
  const [, setLocation] = useLocation();

  // Get user auth data to check role
  const { data: authData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  // Check if user has a subscription
  const { data: subscription } = useQuery<{ subscription: any }>({
    queryKey: ["/api/billing/subscription/subscription"],
    staleTime: 0,
    retry: false,
  });

  const hasSubscription = subscription?.subscription !== null;
  const activeTenant = authData?.activeTenant;
  const canAccessStudio = activeTenant?.role === 'owner' || activeTenant?.role === 'configurator';
  
  // Show upgrade button only if user is owner/admin and has no subscription
  const showUpgradeButton = canAccessStudio && !hasSubscription;

  return (
    <SidebarProvider defaultOpen={true} style={style as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen">
        {/* Header - Fixed */}
        <header className="flex items-center justify-between p-2 border-b shrink-0">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          {showUpgradeButton && (
            <Button
              onClick={() => setLocation("/billing/plans")}
              size="sm"
              className="ml-auto"
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Upgrade
            </Button>
          )}
        </header>
        
        {/* Welcome Banner - Shows for new owner users */}
        <WelcomeBanner />
        
        {/* Main content - Scrollable (vertical only, no horizontal scroll) */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0">
          {children}
        </main>
      </SidebarInset>
      
      {/* Bottom Navigation - Mobile only */}
      <BottomNav />
    </SidebarProvider>
  );
}
