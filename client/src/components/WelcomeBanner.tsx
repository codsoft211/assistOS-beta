import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";

interface AuthResponse {
  user: {
    id: string;
    createdAt?: string;
  };
  activeTenant: {
    role: string;
  };
}

export function WelcomeBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    if (!data?.user) return;
    const dismissed = localStorage.getItem(`welcomeBannerDismissed_${data.user.id}`);
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, [data]);

  const handleDismiss = () => {
    if (!data?.user) return;
    localStorage.setItem(`welcomeBannerDismissed_${data.user.id}`, "true");
    setIsDismissed(true);
  };

  const handleGoToStudio = () => {
    if (!data?.user) return;
    localStorage.setItem(`welcomeBannerDismissed_${data.user.id}`, "true");
    setIsDismissed(true);
    setLocation("/studio");
  };

  if (isLoading || isDismissed || !data) {
    return null;
  }

  const isOwner = data.activeTenant?.role === "owner";
  const isNewUser = data.user.createdAt && new Date(data.user.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (!isOwner || !isNewUser) {
    return null;
  }

  return (
    <Alert 
      className="m-4 border-primary/50 bg-primary/5"
      data-testid="banner-welcome"
    >
      <Sparkles className="h-5 w-5 text-primary" />
      <AlertTitle className="flex items-center justify-between mb-2">
        <span className="text-lg font-semibold">Bem-vindo ao AssistOS!</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-primary/10"
          onClick={handleDismiss}
          data-testid="button-dismiss-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          Para começar a usar o sistema, precisa de <strong>configurar a sua empresa no Studio</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          No Studio, o AssistBuild vai ajudá-lo conversacionalmente a configurar módulos, criar automações e personalizar o sistema para as necessidades da sua empresa.
        </p>
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleGoToStudio}
            className="gap-2"
            data-testid="button-go-to-studio"
          >
            <Sparkles className="h-4 w-4" />
            Ir para Studio
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            data-testid="button-dismiss-later"
          >
            Mais tarde
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
