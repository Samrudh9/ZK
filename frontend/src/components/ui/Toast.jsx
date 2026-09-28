import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from './Card';

const VARIANTS = {
  success: { cls: 'border-success-line bg-success-soft text-success', Icon: CheckCircle2 },
  error: { cls: 'border-danger-line bg-danger-soft text-danger', Icon: XCircle },
  warning: { cls: 'border-warning-line bg-warning-soft text-warning', Icon: AlertTriangle },
  notice: { cls: 'border-info-line bg-info-soft text-info', Icon: Info },
};

const DEFAULT_TTL = 5000;

/**
 * Transient confirmation, anchored bottom-right so it never shifts layout.
 * Renders nothing when `message` is null.
 */
export function Toast({ message, variant = 'success', title, onDismiss, duration = DEFAULT_TTL }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const { cls, Icon } = VARIANTS[variant] || VARIANTS.notice;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] animate-enter" role="status" aria-live="polite">
      <div className={cn('flex items-start gap-3 rounded-card border px-4 py-3 shadow-raised', cls)}>
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-grow">
          {title && <p className="text-sm font-semibold">{title}</p>}
          <p className={cn('text-sm break-words', title && 'mt-0.5')}>{message}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-current opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
