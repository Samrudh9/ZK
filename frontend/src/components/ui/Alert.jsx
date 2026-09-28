import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from './Card';

const VARIANTS = {
  success: { cls: 'alert-success', Icon: CheckCircle2 },
  error: { cls: 'alert-danger', Icon: XCircle },
  warning: { cls: 'alert-warning', Icon: AlertTriangle },
  notice: { cls: 'alert-info', Icon: Info },
};

/**
 * Inline semantic message. Use for form errors and one-shot outcomes;
 * use Toast for transient confirmations.
 */
export function Alert({ variant = 'notice', title, children, action, className }) {
  const { cls, Icon } = VARIANTS[variant] || VARIANTS.notice;

  return (
    <div className={cn(cls, 'flex items-start gap-3', className)} role="alert">
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-grow">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-1', 'break-words')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
