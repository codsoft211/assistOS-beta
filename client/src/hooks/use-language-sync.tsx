import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import i18n from '@/i18n';

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

export function useLanguageSync() {
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ['/api/users/preferences'],
  });

  useEffect(() => {
    if (preferences?.language) {
      const lang = preferences.language === 'en-US' ? 'en' : 'pt';
      console.log('[Language Sync] Applying user language preference:', lang);
      i18n.changeLanguage(lang);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('assistos-language', lang);
      }
    }
  }, [preferences?.language]);
}
