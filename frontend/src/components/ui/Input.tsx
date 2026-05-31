import { forwardRef, type InputProps } from 'react';
import { twMerge } from 'tailwind-merge';

interface InputComponentProps extends InputProps {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputComponentProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-main mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={twMerge(
            'w-full px-4 py-3 border border-border rounded-lg text-text-main placeholder:text-text-muted bg-white',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
            'transition-all duration-200',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';