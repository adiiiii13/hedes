import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from 'react-router';
import { data as json, type LinksFunction, type MetaFunction, type LoaderFunctionArgs } from 'react-router';
import { useEffect } from 'react';
import { loadInitialSettings } from './stores/settings';
import { loadAppearance } from './stores/appearance';
import { getServerSessionToken } from './utils/session-auth.server';
import { initApiClient } from './utils/api-client';
import stylesheet from './styles/globals.css?url';
import { ActionReview } from './components/chat/ActionReview';
import { recoverInterruptedRestore } from './utils/restore-recovery.server';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
];

export const meta: MetaFunction = () => {
  return [
    { title: 'Hedes Studio — Autonomous Multi-Agent AI Development Environment' },
    {
      name: 'description',
      content:
        'Hedes Studio: a local AI development workspace with project memory, skills, MCP tools, and live preview.',
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const hostHeader = request.headers.get('Host');
  const networkOrigin = hostHeader ? new URL(`${url.protocol}//${hostHeader}`).origin : url.origin;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(networkOrigin).hostname)) {
    throw new Response('Local application required', { status: 403 });
  }
  const origin = request.headers.get('Origin');
  if ((origin && origin !== networkOrigin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new Response('Cross-origin bootstrap denied', { status: 403 });
  }
  await recoverInterruptedRestore();
  return json({
    sessionToken: getServerSessionToken(),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
}

export default function App() {
  const data = useLoaderData<typeof loader>();
  // Initialize before child effects fetch settings or project data.
  if (typeof document !== 'undefined' && typeof window.location !== 'undefined' && data?.sessionToken) {
    initApiClient(data.sessionToken);
  }

  useEffect(() => {
    if (data?.sessionToken) {
      initApiClient(data.sessionToken);
    }
    loadAppearance();
    loadInitialSettings();
  }, [data?.sessionToken]);

  return (
    <html lang="en" className="dark h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0d14" />
        <Meta />
        <Links />
      </head>
      <body className="h-full text-[var(--app-text)]">
        <Outlet />
        <ActionReview />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
