import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Surface container. The old glassmorphism panel is gone; this is a solid,
 * clinical surface so dense clinical data stays legible.
 */
export function Card({ className, as: Tag = 'section', ...props }) {
  return <Tag className={cn('surface p-6', className)} {...props} />;
}
