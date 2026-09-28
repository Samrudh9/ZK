import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './Card';

export function Spinner({ className, label }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Loader2 className={cn('w-4 h-4 animate-spin text-accent-400', className)} aria-hidden="true" />
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <span className="sr-only">{label || 'Loading'}</span>
    </span>
  );
}

/** Full-panel loading state for async regions. */
export function Loading({ label = 'Loading…', className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-ink-faint', className)}>
      <Spinner className="w-6 h-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
