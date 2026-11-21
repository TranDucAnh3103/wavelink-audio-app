import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, containerClassName, error, label, id, startIcon, endIcon, ...props }, ref) => {
    return (
      <div className={cn('flex flex-col gap-1.5 w-full', containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="font-extrabold text-[11px] sm:text-xs uppercase tracking-wide text-[var(--ink-primary)]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {startIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center text-[var(--ink-muted)]">
              {startIcon}
            </div>
          )}
          <input
            id={id}
            ref={ref}
            className={cn(
              'input-comic',
              startIcon && 'pl-9',
              endIcon && 'pr-10',
              error && 'border-[#E63946] focus:border-[#E63946]',
              className
            )}
            {...props}
          />
          {endIcon && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
              {endIcon}
            </div>
          )}
        </div>
        {error && <span className="text-[11px] font-bold text-[#E63946] mt-0.5">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
