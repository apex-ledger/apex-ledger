import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BASE = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
  secondary: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
};
const SIZE: Record<ButtonSize, string> = { sm: 'min-h-8 px-3 py-1.5 text-xs', md: 'min-h-10 px-4 py-2 text-sm' };

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; children: ReactNode }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`}>{children}</button>;
}
