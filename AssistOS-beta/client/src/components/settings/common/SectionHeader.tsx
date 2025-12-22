import type { ComponentType, ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
}

export function SectionHeader({ title, description, icon: Icon, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between pb-4 border-b" data-testid="section-header">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="size-5 text-primary" data-testid="section-header-icon" />}
        <div>
          <h2 className="text-2xl font-semibold" data-testid="section-header-title">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground" data-testid="section-header-description">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div data-testid="section-header-action">{action}</div>}
    </div>
  );
}
