import { type ActionFunctionArgs } from '@remix-run/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { resolveProjectDir } from '~/utils/project-dir.server';

const STARTER_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'hedes-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'lucide-react': '^0.344.0',
      },
      devDependencies: {
        '@types/react': '^18.3.5',
        '@types/react-dom': '^18.3.0',
        '@vitejs/plugin-react': '^4.3.1',
        vite: '^5.4.2',
      },
    },
    null,
    2
  ),
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hedes Studio App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  'src/App.tsx': `import React from 'react';
import { Sparkles, Rocket, Layers } from 'lucide-react';

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 18px',
        borderRadius: '9999px',
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        color: '#a5b4fc',
        fontSize: '13px',
        marginBottom: '24px',
        letterSpacing: '0.05em',
        fontWeight: 600
      }}>
        <Sparkles size={16} /> NEW PROJECT READY
      </div>

      <h1 style={{
        fontSize: '3rem',
        fontWeight: 800,
        background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #38bdf8 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        margin: '0 0 16px 0',
        letterSpacing: '-0.02em'
      }}>
        Hedes Studio Workspace
      </h1>

      <p style={{
        color: '#94a3b8',
        maxWidth: '540px',
        lineHeight: 1.6,
        fontSize: '16px',
        margin: '0 0 32px 0'
      }}>
        Your clean project workspace is ready. Type your prompt in the chat panel to build interactive web applications, dashboards, games, or tools.
      </p>

      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '13px',
          color: '#cbd5e1'
        }}>
          <Rocket size={16} color="#38bdf8" /> React + Vite Ready
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '13px',
          color: '#cbd5e1'
        }}>
          <Layers size={16} color="#a855f7" /> HMR & Live Preview Support
        </div>
      </div>
    </div>
  );
}
`,
  'src/index.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background-color: #020617;
  color: #f8fafc;
}
`,
};

function killPort5173() {
  try {
    if (process.platform === 'win32') {
      exec(
        'powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
        () => {}
      );
    } else {
      exec('fuser -k 5173/tcp', () => {});
    }
  } catch {}
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedId = body.chatId || `chat-${Date.now()}`;

    const { projectDir, resolvedChatId } = await resolveProjectDir(requestedId);

    // Write all starter files to the project directory
    for (const [relPath, content] of Object.entries(STARTER_FILES)) {
      const fullPath = path.join(projectDir, relPath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    // Kill any lingering server on port 5173 so preview is cleanly reset
    killPort5173();

    return new Response(
      JSON.stringify({
        success: true,
        chatId: resolvedChatId,
        projectDir,
        files: STARTER_FILES,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('Project init error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
