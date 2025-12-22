import {
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  User,
  Building2,
  Check,
  CheckSquare,
  Mail,
  DollarSign,
  ShoppingCart,
  FileText,
  Package,
  Truck,
  Briefcase,
  Users,
  LucideIcon,
  ChevronRight,
  Sparkles,
  MessageCircle,
  Wallet,
  FlaskConical,
  Rocket,
  Upload,
  Shield,
  Workflow
} from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";


import logoLight from "/logo_light.png";
import logoDark from "/logo_dark.png";


// Icon mapping for dynamic modules
const iconMap: Record<string, LucideIcon> = {
  DollarSign,
  ShoppingCart,
  FileText,
  Package,
  Truck,
  Briefcase,
  Users,
  Mail,
};

interface SidebarModulePage {
  title: string;
  url: string;
  icon?: string;
  isGroup?: boolean;
  children?: SidebarModulePage[];
}

interface SidebarModule {
  id: string;
  moduleId: string;
  name: string;
  icon?: string;
  category: string;
  isActive: boolean;
  isHiddenByUser: boolean;
  pages?: SidebarModulePage[];
}

interface ModulePageTree {
  id: string;
  displayLabel: string;
  routePath: string | null;
  icon: string | null;
  displayOrder: number;
  isGroup: boolean;
  children: ModulePageTree[];
}

// Type guard to check if page is ModulePageTree (legacy format)
function isModulePageTree(page: any): page is ModulePageTree {
  return 'displayLabel' in page && 'routePath' in page;
}

// Type guard to check if page is hierarchical SidebarModulePage (has isGroup and/or children)
function isHierarchicalPage(page: SidebarModulePage): boolean {
  return page.isGroup === true || (page.children !== undefined && page.children.length > 0);
}

// Helper to get icon component from string name
function getIconComponent(iconName?: string): LucideIcon {
  if (!iconName) return Package;
  return iconMap[iconName] || Package;
}

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation('common');
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const { data } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  // Fetch current environment
  const { data: envData } = useQuery<{ environment: string }>({
    queryKey: ['/api/environment/current'],
    retry: false,
    enabled: !!data?.user,
  });

  // Fetch sidebar modules dynamically - always refetch on page load
  const { data: modulesData, isLoading: modulesLoading } = useQuery<{ modules: SidebarModule[] }>({
    queryKey: ['/api/modules/sidebar'],
    retry: false,
    enabled: !!data?.user, // Only fetch if user is authenticated
    staleTime: 0, // Data is always considered stale
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  const user = data?.user;
  const tenants = data?.tenants || [];
  const activeTenant = data?.activeTenant;
  const isPlatformAdmin = user?.isPlatformAdmin || false;

  // Fetch subscription to get plan name
  const { data: subscriptionData } = useQuery<{ subscription: any; plan: { name: string } }>({
    queryKey: ["/api/billing/subscription/subscription"],
    retry: false,
    staleTime: 30000, // Cache for 30 seconds
    enabled: !!data?.user && !!activeTenant,
  });
  const canAccessStudio = activeTenant?.role === 'owner' || activeTenant?.role === 'configurator';
  const canPublish = activeTenant?.role === 'owner' || activeTenant?.role === 'admin';
  const canManageBilling = activeTenant?.role === 'owner' || activeTenant?.role === 'admin';
  const planName = subscriptionData?.plan?.name;

  // Personal navigation items with translations
  const pessoalItems = [
    {
      title: t('common:navigation.dashboard'),
      url: "/dashboard",
      icon: BarChart3,
    },
    {
      title: t('common:navigation.chat'),
      url: "/chat",
      icon: MessageSquare,
    },
    {
      title: t('common:navigation.communications'),
      url: "/comunicacoes",
      icon: Mail,
    },
    {
      title: t('common:navigation.tasks'),
      url: "/tarefas",
      icon: CheckSquare,
    },
    ...(canManageBilling ? [{
      title: "Billing",
      url: "/billing",
      icon: DollarSign,
    }] : []),
    // Usage - Only for owners/admins
    ...(canAccessStudio ? [{
      title: "Usage",
      url: "/usage",
      icon: Wallet,
    }] : []),
    // Admin Panel - Only for platform admins
    ...(isPlatformAdmin ? [{
      title: "Admin Panel",
      url: "/admin",
      icon: Shield,
    }] : []),
  ];

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/environment/publish");
    },
    onSuccess: (data: any) => {
      setPublishDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/modules/sidebar'] });
      toast({
        title: "✅ Publicado com sucesso!",
        description: `${data.modulesPublished} módulo(s) publicado(s) para production`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro ao publicar",
        description: error.message || "Não foi possível publicar para production",
        variant: "destructive",
      });
    },
  });

  const switchTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return await apiRequest("POST", "/api/auth/switch-tenant", { tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/sidebar'] });
      toast({
        title: t('common:toast.tenantSwitched'),
        description: t('common:toast.tenantSwitchedDesc'),
      });
      // Reload to refresh all data for new tenant
      window.location.reload();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login");
      toast({
        title: t('common:toast.loggedOut'),
        description: t('common:toast.loggedOutDesc'),
      });
    },
  });

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "U";

  // Helper function to check if any child is active (recursively)
  const hasActiveChild = (pages: any[]): boolean => {
    // Handle undefined or null pages array
    if (!pages || !Array.isArray(pages)) return false;

    return pages.some((page: any) => {
      // Check current page URL (handles both ModulePageTree and SidebarModulePage)
      const pageUrl = page.url || page.routePath || '';
      if (pageUrl && pageUrl === location) return true;

      // Recursively check children (works for both data shapes)
      if (page.children && page.children.length > 0) {
        return hasActiveChild(page.children);
      }

      return false;
    });
  };

  // Helper to translate page displayLabel to localized text
  const translatePageLabel = (displayLabel: string): string => {
    // Map English displayLabel to i18n key (camelCase)
    const labelMap: Record<string, string> = {
      'Dashboard': 'common:pages.dashboard',
      'Accounts Receivable': 'common:pages.accountsReceivable',
      'Accounts Payable': 'common:pages.accountsPayable',
      'Treasury': 'common:pages.treasury',
    };

    const translationKey = labelMap[displayLabel];
    if (translationKey) {
      return t(translationKey, { defaultValue: displayLabel });
    }

    // Fallback to original displayLabel if no translation key found
    return displayLabel;
  };

  // Recursive rendering helper for unlimited nesting depth
  const renderPageItem = (page: any, moduleId: string, pageIndex: number, parentPath: string = ''): React.ReactNode => {
    // Normalize ModulePageTree to SidebarModulePage shape
    const pageTitle = page.title || page.displayLabel || '';
    const pageUrl = page.url || page.routePath || '';
    const children = page.children || [];
    const translatedTitle = translatePageLabel(pageTitle);

    // Create unique hierarchical path for stable keys with safe slugification
    const safeSlug = (str: string) => str ? str.toLowerCase().replace(/\s/g, '-') : '';
    const pagePath = pageUrl || safeSlug(pageTitle) || `${parentPath}-${pageIndex}`;
    const fullPath = parentPath ? `${parentPath}:${pagePath}` : pagePath;
    const uniqueKey = `${moduleId}:${fullPath}:${pageIndex}`;

    // Group with children - render as expandable Collapsible
    if (page.isGroup && children.length > 0) {
      return (
        <Collapsible
          asChild
          key={uniqueKey}
          defaultOpen={hasActiveChild(children)}
          className="group/collapsible"
        >
          <SidebarMenuSubItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuSubButton className="w-full">
                <span>{translatedTitle}</span>
                <ChevronRight className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuSubButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {children.map((child: any, childIdx: number) => renderPageItem(child, moduleId, childIdx, fullPath))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuSubItem>
        </Collapsible>
      );
    }

    // Regular leaf page - render as clickable link
    if (pageUrl) {
      const isPageActive = location === pageUrl;
      return (
        <SidebarMenuSubItem key={uniqueKey}>
          <SidebarMenuSubButton
            isActive={isPageActive}
            onClick={() => setLocation(pageUrl)}
            data-testid={`link-${moduleId}-${safeSlug(pageTitle)}`}
          >
            <span>{translatedTitle}</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      );
    }

    return null;
  };

  // Filter and transform modules for sidebar with translations
  const visibleModules = useMemo(() => {
    return modulesData?.modules
      ?.filter(m => m.isActive && !m.isHiddenByUser)
      .map(m => {
        // Translate module name using moduleId as key with fallback to server-provided name
        const translationKey = `common:modules.${m.moduleId}`;
        const translatedName = t(translationKey, { defaultValue: m.name });

        return {
          title: translatedName,
          url: `/${m.moduleId}`,
          icon: getIconComponent(m.icon),
          moduleId: m.moduleId,
          pages: m.pages,
        };
      }) || [];
  }, [modulesData, t]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 py-2 pt-[16px] pb-[16px]">
            <img
              src={logoLight}
              alt="AssistOS"
              className="h-7 w-auto dark:hidden"
              data-testid="img-assistos-logo-light"
            />
            <img
              src={logoDark}
              alt="AssistOS"
              className="h-7 w-auto hidden dark:block"
              data-testid="img-assistos-logo-dark"
            />
          </div>

          {/* Environment Badge */}
          {envData?.environment && (
            <div className="px-2 pb-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${envData.environment === 'sandbox'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                }`} data-testid={`badge-environment-${envData.environment}`}>
                {envData.environment === 'sandbox' ? (
                  <FlaskConical className="h-3.5 w-3.5" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                <span className="uppercase tracking-wide">
                  {envData.environment === 'sandbox' ? 'Sandbox' : 'Production'}
                </span>
              </div>
            </div>
          )}

          {/* Publish Button - Only in Sandbox for Owners/Admins */}
          {envData?.environment === 'sandbox' && canPublish && (
            <div className="px-2 pb-2">
              <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-2"
                    data-testid="button-publish-to-production"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Publicar para Production
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-publish-confirmation">
                  <DialogHeader>
                    <DialogTitle>Publicar para Production?</DialogTitle>
                    <DialogDescription>
                      Isso irá copiar TODOS os módulos e configurações do ambiente Sandbox para Production.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Módulos que serão publicados:</p>
                      {modulesLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-full" />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {visibleModules.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nenhum módulo ativo no ambiente Sandbox
                            </p>
                          ) : (
                            visibleModules.map((module) => (
                              <div
                                key={module.moduleId}
                                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-secondary/50"
                              >
                                <module.icon className="h-4 w-4" />
                                <span>{module.title}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-md">
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        <strong>Atenção:</strong> Esta ação irá substituir TODOS os módulos existentes em Production pelos módulos atuais do Sandbox.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setPublishDialogOpen(false)}
                      disabled={publishMutation.isPending}
                      data-testid="button-cancel-publish"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending || visibleModules.length === 0}
                      data-testid="button-confirm-publish"
                    >
                      {publishMutation.isPending ? "Publicando..." : "Confirmar Publicação"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </SidebarGroup>

        {/* PESSOAL Section - Collapsible */}
        <Collapsible defaultOpen={true} className="group/pessoal">
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="mt-[-5px] mb-[-5px] cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1 flex items-center gap-2">
                <span>{t('common:navigation.personal').toUpperCase()}</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/pessoal:rotate-90" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pessoalItems.map((item) => {
                    const isActive = location === item.url;
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.url)}
                          data-testid={`link-${item.url.substring(1)}`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* MÓDULOS Section - Collapsible Dynamic */}
        <Collapsible defaultOpen={true} className="group/modulos">
          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="mt-[-5px] mb-[-5px] cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1 flex items-center gap-2">
                <span>{t('common:navigation.modules').toUpperCase()}</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/modulos:rotate-90" />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                {modulesLoading ? (
                  <div className="space-y-2 px-2">
                    <Skeleton className="h-8 w-full" data-testid="skeleton-module-loading" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <SidebarMenu>
                    {visibleModules.map((item) => {
                      const hasPages = item.pages && item.pages.length > 0;
                      const isModuleActive = location.startsWith(item.url);

                      return (
                        <Collapsible asChild key={item.moduleId} defaultOpen={isModuleActive} className="group/collapsible">
                          <SidebarMenuItem>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                data-testid={`link-module-${item.moduleId}`}
                                className="w-full"
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.title}</span>
                                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {item.pages?.map((page: any, index: number) => renderPageItem(page, item.moduleId, index))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      );
                    })}
                    {visibleModules.length === 0 && !modulesLoading && (
                      <div className="px-2 py-4 text-sm text-muted-foreground" data-testid="text-no-modules">
                        {t('common:common.noData')}
                      </div>
                    )}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="button-user-menu">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.avatar} alt={user?.firstName} />
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col text-left min-w-0">
                    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                      <span className="text-sm font-medium truncate min-w-0">
                        {user?.firstName} {user?.lastName}
                      </span>
                      {planName && (
                        <>
                          <span className="text-sm text-muted-foreground shrink-0">·</span>
                          <span className="text-sm text-muted-foreground shrink-0">
                            {planName} Plan
                          </span>
                        </>
                      )}
                    </div>
                    {activeTenant && (
                      <span className="text-xs text-muted-foreground truncate">
                        {activeTenant.name}
                      </span>
                    )}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('common:userMenu.myAccount')}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Tenant Switcher */}
                {tenants.length > 1 && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger data-testid="menu-switch-tenant">
                        <Building2 className="mr-2 h-4 w-4" />
                        <span>{t('common:userMenu.switchOrganization')}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {activeTenant?.name}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {tenants.map((tenant: any) => (
                          <DropdownMenuItem
                            key={tenant.id}
                            onClick={() => {
                              if (tenant.id !== activeTenant?.id) {
                                switchTenantMutation.mutate(tenant.id);
                              }
                            }}
                            disabled={tenant.id === activeTenant?.id || switchTenantMutation.isPending}
                            data-testid={`menu-tenant-${tenant.slug}`}
                          >
                            <Check className={`mr-2 h-4 w-4 ${tenant.id === activeTenant?.id ? "opacity-100" : "opacity-0"}`} />
                            <div className="flex flex-col">
                              <span className="text-sm">{tenant.name}</span>
                              <span className="text-xs text-muted-foreground">{tenant.role}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem
                  onClick={() => setLocation("/settings")}
                  data-testid="menu-settings"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>

                {canAccessStudio && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/studio")}
                    data-testid="menu-studio"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Studio
                  </DropdownMenuItem>
                )}

                {isPlatformAdmin && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/admin")}
                    data-testid="menu-admin-panel"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Admin Panel
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  data-testid="menu-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {logoutMutation.isPending ? t('common:userMenu.loggingOut') : t('common:userMenu.logOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
