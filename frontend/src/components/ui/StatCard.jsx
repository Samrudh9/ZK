import React from 'react';
import { cn } from './Card';

/** Compact metric tile for proof/policy counters and reference values. */
export function StatCard({ label, value, hint, mono = false, className, children }) {
  return (
    <div className={cn('surface-sunken p-4', className)}>
      <p className="section-label">{label}</p>
      <p className={cn('mt-1.5 break-words text-ink', mono ? 'font-mono text-[13px]' : 'font-display text-lg font-semibold')}>
        {value ?? '—'}
      </p>
      {hint && <p className="mt-1 text-[13px] text-ink-faint">{hint}</p>}
      {children}
    </div>
  );
}
