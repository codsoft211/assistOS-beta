import { useState } from 'react';
import type { ComponentType } from 'react';
import { User, Settings, MessageSquare, Plug, Users, Code } from 'lucide-react';

export type SettingsSection = 'perfil' | 'preferencias' | 'comunicacao' | 'conectores' | 'team' | 'studio';

interface SettingsMenuItem {
  id: SettingsSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface UseSettingsMenuReturn {
  activeSection: SettingsSection;
  setActiveSection: (section: SettingsSection) => void;
  sections: SettingsMenuItem[];
}

const ALL_SECTIONS: SettingsMenuItem[] = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'preferencias', label: 'Preferências', icon: Settings },
  { id: 'comunicacao', label: 'Comunicação', icon: MessageSquare },
  { id: 'conectores', label: 'Conectores', icon: Plug },
  { id: 'team', label: 'Team', icon: Users, adminOnly: true },
  { id: 'studio', label: 'Studio', icon: Code, adminOnly: true },
];

export function useSettingsMenu(userRole?: string): UseSettingsMenuReturn {
  const [activeSection, setActiveSection] = useState<SettingsSection>('perfil');

  // Filter sections based on user role (RBAC)
  const sections = ALL_SECTIONS.filter(section => {
    if (section.adminOnly) {
      return userRole === 'owner' || userRole === 'admin';
    }
    return true;
  });

  return {
    activeSection,
    setActiveSection,
    sections,
  };
}
