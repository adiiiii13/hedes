import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { useEffect } from 'react';
import { loadInitialSettings } from './stores/settings';
import stylesheet from './styles/globals.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  },
];

export const meta: MetaFunction = () => {
  return [
    { title: 'Hedes Studio — Autonomous Multi-Agent AI Development Environment' },
    {
      name: 'description',
      content:
        'Hedes Studio: 100-bot Hive Mind swarm intelligence and universal LLM adapter for live browser app creation.',
    },
  ];
};

export default function App() {
  useEffect(() => {
    loadInitialSettings();
  }, []);

  return (
    <html lang="en" className="dark h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-[#0a0a1a] text-[#e2e8f0]">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
