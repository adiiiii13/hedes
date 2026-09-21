import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '~/utils/cn';

export type ButtonVariant = 'emerald' | 'violet' | 'ghost' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface GlowButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const GlowButton: React.FC<GlowButtonProps> = ({
  variant = 'emerald',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}) => {
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-2xl gap-2.5',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    emerald:
      'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-medium hover:brightness-110 shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-400/40',
    violet:
      'bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium hover:brightness-110 shadow-[0_0_20px_rgba(139,92,246,0.3)] border border-violet-500/40',
    ghost:
      'bg-transparent text-slate-300 hover:text-white hover:bg-white/5 border border-transparent',
    glass:
      'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 backdrop-blur-md hover:border-emerald-500/40 transition-colors',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </motion.button>
  );
};
