import React from 'react';
import { cn } from './Card';

/** Placeholder for a region with no data yet: icon + title + helper + action. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card',
        'border border-dashed border-hairline bg-surface-sunken px-6 py-12 text-center',
        className
      )}
    >
      {Icon && <Icon className="w-9 h-9 text-ink-faint" aria-hidden="true" />}
      <div>
        <p className="font-display text-base font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
