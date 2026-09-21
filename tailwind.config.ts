import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hedes: {
          bg: '#0a0a1a',
          surface: '#111128',
          'surface-hover': '#181838',
          'surface-active': '#1e1e48',
          border: '#1e1e3a',
          'border-bright': '#2e2e5c',
          emerald: '#10b981',
          'emerald-glow': 'rgba(16, 185, 129, 0.25)',
          violet: '#8b5cf6',
          'violet-glow': 'rgba(139, 92, 246, 0.25)',
          cyan: '#06b6d4',
          text: '#e2e8f0',
          muted: '#64748b',
          dim: '#334155',
        },
      },
      backgroundImage: {
        'aurora-glow': 'radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.15) 0%, rgba(16, 185, 129, 0.08) 35%, transparent 70%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
        'card-gradient': 'linear-gradient(180deg, rgba(17, 17, 40, 0.8) 0%, rgba(10, 10, 26, 0.9) 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        swarmScan: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'swarm-scan': 'swarmScan 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
