import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './Card';

const VARIANTS = {
  primary:
    'bg-accent-500 text-white border-accent-500 hover:bg-accent-600 hover:border-accent-600 shadow-surface',
  secondary:
    'bg-surface-raised text-ink border-hairline hover:bg-surface-sunken hover:border-hairline-strong',
  ghost:
    'bg-transparent text-ink-muted border-transparent hover:bg-surface-raised hover:text-ink',
  danger: 'bg-danger text-white border-danger hover:opacity-90 shadow-surface',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-control border font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
        'disabled:opacity-55 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
