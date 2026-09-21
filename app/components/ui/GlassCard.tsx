import React from 'react';
import { cn } from '~/utils/cn';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
  children: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  hoverEffect = true,
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-2xl bg-[#111128]/70 border border-[#1e1e3a] backdrop-blur-md transition-all duration-300',
        hoverEffect && 'hover:border-emerald-500/30 hover:shadow-[0_0_25px_rgba(16,185,129,0.06)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
