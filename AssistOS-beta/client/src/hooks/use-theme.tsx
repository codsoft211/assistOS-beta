import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: "pt-PT" | "en-US";
  tenantContext?: string;
  aiTone: "formal" | "casual" | "technical" | "friendly" | "executive";
  draftMessageTone: "formal" | "casual" | "technical" | "friendly" | "executive";
  notifications: {
    channels: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
    events: {
      emailReceived: boolean;
      teamMemberJoined: boolean;
      taskAssigned: boolean;
      systemUpdates: boolean;
    };
  };
}

function getEffectiveTheme(theme: "light" | "dark" | "system"): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function useTheme() {
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ['/api/users/preferences'],
  });

  useEffect(() => {
    const theme = preferences?.theme || "system";
    const effectiveTheme = getEffectiveTheme(theme);
    
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(effectiveTheme);
  }, [preferences?.theme]);

  useEffect(() => {
    if (preferences?.theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const effectiveTheme = mediaQuery.matches ? "dark" : "light";
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(effectiveTheme);
      };
      
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [preferences?.theme]);
}
