import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getQueryFn } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

interface PlatformAdminGuardProps {
  children: React.ReactNode;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    isPlatformAdmin?: boolean;
    lastLogin?: Date | null;
    createdAt?: Date | null;
  };
  tenants: any[];
  activeTenant: any;
}

/**
 * PlatformAdminGuard - Protects routes that require platform administrator access
 * 
 * Security Layers:
 * 1. Frontend: This guard (prevents page rendering)
 * 2. Backend: requirePlatformAdmin middleware (prevents API access)
 * 
 * Even if someone bypasses frontend, backend will reject all API calls.
 */
export function PlatformAdminGuard({ children }: PlatformAdminGuardProps) {
  const [, setLocation] = useLocation();

  const { data: authData, isLoading } = useQuery<AuthResponse | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !authData) {
      setLocation("/login");
      return;
    }
  }, [isLoading, authData, setLocation]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authData || !authData.user) {
    return null;
  }

  const isPlatformAdmin = authData.user.isPlatformAdmin || false;

  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <ShieldX className="h-4 w-4" />
          <AlertDescription className="mt-2">
            <div className="space-y-4">
              <div>
                <p className="font-semibold">Access Denied</p>
                <p className="text-sm mt-1">
                  This page requires platform administrator privileges.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

