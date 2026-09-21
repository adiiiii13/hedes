export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;
export const APP_NAME = 'Hedes Studio';

export const MOD_KEY = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_PROVIDER = 'Groq';

export const STARTER_TEMPLATES = [
  {
    name: 'React + Vite (Tailwind)',
    description: 'Fast modern React app with Tailwind CSS and Vite',
    prompt: 'Create a modern React application using Vite and Tailwind CSS with responsive layout and clean components.',
    icon: 'Atom',
  },
  {
    name: 'Fullstack Dashboard',
    description: 'Analytics dashboard with charts, stats cards and dark mode',
    prompt: 'Build a fullstack analytics dashboard with interactive charts, recent activity table, KPI stat cards, and dark mode.',
    icon: 'LayoutDashboard',
  },
  {
    name: 'AI Agent Playground',
    description: 'Multi-bot agentic chat playground with custom parameters',
    prompt: 'Build an AI agent playground where users can configure multiple bots, test prompts, and see simulated multi-agent interactions.',
    icon: 'Bot',
  },
  {
    name: 'E-Commerce Storefront',
    description: 'Product catalog with filter, search and shopping cart',
    prompt: 'Create a sleek e-commerce storefront with product grid, category filtering, search, modal details, and interactive shopping cart.',
    icon: 'ShoppingBag',
  },
];
