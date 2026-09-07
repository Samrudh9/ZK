import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function Card({ className, children, ...props }) {
  return (
    <div 
      className={cn("glass-panel rounded-2xl p-6", className)} 
      {...props}
    >
      {children}
    </div>
  );
}
