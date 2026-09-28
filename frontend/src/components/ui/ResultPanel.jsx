import React from 'react';
import { cn } from './Card';
import { Loading } from './Spinner';
import { EmptyState } from './EmptyState';

/**
 * Shared shell for a result region so both dashboards present success,
 * loading and empty states identically.
 *
 * states: 'empty' | 'loading' | 'ready'
 */
export function ResultPanel({ state = 'empty', empty, loadingLabel, children, className }) {
  if (state === 'loading') return <Loading label={loadingLabel} className={className} />;
  if (state === 'empty') return <EmptyState {...empty} className={cn('h-full', className)} />;
  return <div className={cn('animate-enter', className)}>{children}</div>;
}
