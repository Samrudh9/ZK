import React from 'react';
import { cn } from './Card';

/**
 * Label + control + hint/error wrapper so every form field in the app
 * looks and reads the same.
 */
export function Field({ label, htmlFor, error, hint, required, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-muted">
          {label}
          {required && <span className="text-danger ml-1" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-ink-faint">{hint}</p>
      )}
    </div>
  );
}
