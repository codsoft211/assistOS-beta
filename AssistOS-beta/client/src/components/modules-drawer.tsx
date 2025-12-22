import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Package, LucideIcon, ChevronRight } from "lucide-react";
import {
  DollarSign,
  ShoppingCart,
  FileText,
  Truck,
  Briefcase,
  Users,
  Mail,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

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

function getIconComponent(iconName?: string): LucideIcon {
  if (!iconName) return Package;
  return iconMap[iconName] || Package;
}

interface ModulesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModulesDrawer({ open, onOpenChange }: ModulesDrawerProps) {
  const [, setLocation] = useLocation();
  const location = useLocation()[0];

  const { data: modulesData, isLoading } = useQuery<{ modules: SidebarModule[] }>({
    queryKey: ["/api/modules/sidebar"],
    retry: false,
    enabled: open, // Only fetch when drawer is open
  });

  const visibleModules = modulesData?.modules
    ?.filter((m) => m.isActive && !m.isHiddenByUser) || [];

  const handleNavigate = (url: string) => {
    setLocation(url);
    onOpenChange(false);
  };

  // Recursive function to render pages with hierarchical groups
  const renderModulePage = (
    page: SidebarModulePage,
    moduleId: string,
    pageIndex: number,
    parentPath = ""
  ): React.ReactNode => {
    const children = page.children || [];
    const pageUrl = page.url;
    const pageTitle = page.title;
    
    // Create hierarchical path for unique keys
    const safeSlug = (str: string) => str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const pagePath = pageUrl || safeSlug(pageTitle) || `${parentPath}-${pageIndex}`;
    const fullPath = parentPath ? `${parentPath}:${pagePath}` : pagePath;
    const uniqueKey = `${moduleId}:${fullPath}:${pageIndex}`;

    // Check if any child is active (for defaultOpen state)
    const hasActiveChild = (items: SidebarModulePage[]): boolean => {
      return items.some(item => {
        if (item.url && location === item.url) return true;
        if (item.children && item.children.length > 0) {
          return hasActiveChild(item.children);
        }
        return false;
      });
    };

    // Group with children - render as expandable Collapsible
    if (page.isGroup && children.length > 0) {
      return (
        <Collapsible 
          key={uniqueKey} 
          defaultOpen={hasActiveChild(children)}
          className="group/collapsible"
        >
          <CollapsibleTrigger 
            className="w-full flex items-center justify-between p-2 rounded-md hover-elevate active-elevate-2"
            data-testid={`drawer-group-${moduleId}-${safeSlug(pageTitle)}`}
          >
            <span className="text-sm font-medium">{pageTitle}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-4 mt-1 space-y-1">
              {children.map((child, childIdx) => renderModulePage(child, moduleId, childIdx, fullPath))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    // Regular leaf page - render as clickable button
    if (pageUrl) {
      const isPageActive = location === pageUrl;
      return (
        <button
          key={uniqueKey}
          onClick={() => handleNavigate(pageUrl)}
          className={`w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate active-elevate-2 text-left ${
            isPageActive ? 'text-primary font-medium' : ''
          }`}
          data-testid={`drawer-page-${moduleId}-${safeSlug(pageTitle)}`}
        >
          {pageTitle}
        </button>
      );
    }

    // Page without URL and not a group - skip rendering
    return null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[75vw] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle>Módulos</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : visibleModules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum módulo ativo</p>
            </div>
          ) : (
            visibleModules.map((module) => {
              const Icon = getIconComponent(module.icon);
              const hasPages = module.pages && module.pages.length > 0;

              if (!hasPages) {
                return null;
              }

              return (
                <Collapsible key={module.moduleId} defaultOpen>
                  <CollapsibleTrigger 
                    className="group w-full flex items-center justify-between p-3 rounded-lg hover-elevate active-elevate-2"
                    data-testid={`module-trigger-${module.moduleId}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{module.name}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="ml-8 mt-1 space-y-1">
                      {module.pages?.map((page, idx) => renderModulePage(page, module.moduleId, idx))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
