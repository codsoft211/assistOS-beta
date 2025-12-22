import { useState } from "react";
import { MessageSquare, User, Menu, Building2, Settings as SettingsIcon, Wrench, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TenantWithRole {
  id: string;
  name: string;
  role: string;
}

interface UserIdentity {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface AuthResponse {
  user: UserIdentity;
  tenants: TenantWithRole[];
  activeTenant: TenantWithRole | null;
}

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const { toggleSidebar } = useSidebar();
  const { toast } = useToast();

  const { data: authData } = useQuery<AuthResponse>({
    queryKey: ['/api/auth/me'],
  });

  const switchTenant = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest('POST', '/api/auth/switch-tenant', { tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: 'Organização alterada',
        description: 'A organização foi alterada com sucesso.',
      });
      setAccountOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao trocar organização',
        description: error.message || 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const canAccessStudio = authData?.activeTenant?.role === 'owner' || authData?.activeTenant?.role === 'configurator';

  const user = authData?.user;
  const userInitials = user 
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() 
    : 'U';

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        data-testid="bottom-nav"
      >
        <div className="bg-card/95 backdrop-blur-md border-t border-border/50">
          <div className="flex items-center justify-around px-4 py-2 max-w-md mx-auto">
            {/* Left: Sidebar Toggle */}
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-lg transition-all duration-200 active:scale-95 touch-manipulation",
                "hover-elevate active-elevate-2"
              )}
              data-testid="bottom-nav-sidebar"
            >
              <Menu className="h-5 w-5 text-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">Menu</span>
            </button>

            {/* Center: Chat */}
            <button
              onClick={() => setLocation('/chat')}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-lg transition-all duration-200 active:scale-95 touch-manipulation",
                (location === "/chat" || location === "/")
                  ? "bg-primary text-primary-foreground"
                  : "hover-elevate active-elevate-2"
              )}
              data-testid="bottom-nav-chat"
            >
              <MessageSquare className={cn(
                "h-5 w-5",
                (location === "/chat" || location === "/") && "fill-current"
              )} />
              <span className={cn(
                "text-[10px] font-medium",
                (location === "/chat" || location === "/") ? "text-primary-foreground" : "text-muted-foreground"
              )}>
                Chat
              </span>
            </button>

            {/* Right: My Account */}
            <button
              onClick={() => setAccountOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-lg transition-all duration-200 active:scale-95 touch-manipulation",
                location.startsWith("/settings")
                  ? "bg-primary/10 text-primary"
                  : "hover-elevate active-elevate-2"
              )}
              data-testid="bottom-nav-account"
            >
              <User className="h-5 w-5" />
              <span className={cn(
                "text-[10px] font-medium",
                location.startsWith("/settings") ? "text-primary" : "text-muted-foreground"
              )}>
                Account
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Account Sheet */}
      <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh]" data-testid="sheet-account">
          <SheetHeader className="text-left">
            <SheetTitle>Minha Conta</SheetTitle>
            <SheetDescription>
              Gerir perfil, organizações e configurações
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" data-testid="text-user-name">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-user-email">
                  {user?.email}
                </p>
              </div>
            </div>

            <Separator />

            {/* Organizations */}
            {authData?.tenants && authData.tenants.length > 1 && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Organizações</h3>
                  <div className="space-y-2">
                    {authData.tenants.map((tenant) => (
                      <button
                        key={tenant.id}
                        onClick={() => switchTenant.mutate(tenant.id)}
                        disabled={tenant.id === authData.activeTenant?.id || switchTenant.isPending}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors active-elevate-2",
                          tenant.id === authData.activeTenant?.id
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "hover-elevate"
                        )}
                        data-testid={`button-tenant-${tenant.id}`}
                      >
                        <Building2 className="size-5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setAccountOpen(false);
                  setLocation('/settings');
                }}
                data-testid="button-go-settings"
              >
                <SettingsIcon className="size-4 mr-2" />
                Settings
              </Button>

              {canAccessStudio && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setAccountOpen(false);
                    setLocation('/studio');
                  }}
                  data-testid="button-go-studio"
                >
                  <Wrench className="size-4 mr-2" />
                  Studio
                </Button>
              )}

              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={async () => {
                  try {
                    await apiRequest('POST', '/api/auth/logout');
                    queryClient.clear();
                    setAccountOpen(false);
                    window.location.href = '/login';
                  } catch (error) {
                    toast({
                      title: 'Erro',
                      description: 'Não foi possível terminar a sessão.',
                      variant: 'destructive',
                    });
                  }
                }}
                data-testid="button-logout"
              >
                <LogOut className="size-4 mr-2" />
                Log out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
