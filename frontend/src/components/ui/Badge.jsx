import React from 'react';
import { cn } from './Card';

/**
 * Status pill for policy / access / proof states.
 * Tones: active | revoked | expired | exhausted | granted | replayed | neutral
 */
const TONES = {
  active: 'bg-success-soft text-success border-success-line',
  granted: 'bg-success-soft text-success border-success-line',
  revoked: 'bg-danger-soft text-danger border-danger-line',
  expired: 'bg-warning-soft text-warning border-warning-line',
  exhausted: 'bg-warning-soft text-warning border-warning-line',
  replayed: 'bg-danger-soft text-danger border-danger-line',
  info: 'bg-info-soft text-info border-info-line',
  neutral: 'bg-surface-raised text-ink-muted border-hairline',
};

const LABEL = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
  EXHAUSTED: 'exhausted',
  ACCESS_GRANTED: 'granted',
  PROOF_REPLAYED: 'replayed',
};

export function Badge({ status, tone, children, className }) {
  const key = String(status || '').toUpperCase();
  const resolvedTone = tone || LABEL[key] || 'neutral';
  const text = children ?? key.replace(/_/g, ' ').toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-[11px] font-semibold uppercase tracking-wide',
        TONES[resolvedTone] || TONES.neutral,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  );
}
