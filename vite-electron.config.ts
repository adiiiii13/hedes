import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig(() => {
  return {
    build: {
      target: 'esnext',
      emptyOutDir: false,
    },
    ssr: {
      noExternal: true,
    },
    resolve: {
      alias: {
        '~': path.resolve(__dirname, 'app'),
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
    plugins: [
      nodePolyfills({
        include: ['buffer', 'process'],
        globals: {
          Buffer: true,
          process: true,
          global: true,
        },
        exclude: ['child_process', 'fs', 'path', 'stream', 'util'],
      }),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
        },
        serverModuleFormat: 'esm',
      }),
      tsconfigPaths(),

      // Force SSR build into a single chunk for Electron ASAR compatibility
      {
        name: 'ssr-inline-dynamic-imports',
        config(_config: any, env: any) {
          if (env.isSsrBuild) {
            return {
              build: {
                rollupOptions: {
                  output: {
                    inlineDynamicImports: true,
                  },
                },
              },
            };
          }
        },
      },
      // Safety net: ensure single bundle, inject polyfills, create .mjs and package.json for ASAR
      {
        name: 'ssr-merge-chunks',
        apply: 'build' as const,
        closeBundle() {
          const serverDir = path.resolve(__dirname, 'build', 'server');
          const indexPath = path.join(serverDir, 'index.js');
          const mjsPath = path.join(serverDir, 'index.mjs');
          const pkgPath = path.join(serverDir, 'package.json');

          if (!fs.existsSync(indexPath)) return;

          let indexContent = fs.readFileSync(indexPath, 'utf-8');

          // Check if index.js re-exports from a chunk in ./assets/
          const reExportMatch = indexContent.match(/from\s+['"]\.\/assets\/(server-build[^'"]+)['"]/);
          if (reExportMatch) {
            const chunkName = reExportMatch[1];
            const chunkPath = path.join(serverDir, 'assets', chunkName);
            if (fs.existsSync(chunkPath)) {
              console.log(`[ssr-merge-chunks] Merging ${chunkName} into index.js for ASAR compatibility...`);
              indexContent = fs.readFileSync(chunkPath, 'utf-8');
            }
          }

          // Ensure self polyfill is at the top of the server bundle
          if (!indexContent.includes('globalThis.self = globalThis')) {
            indexContent = 'if (typeof self === "undefined") { globalThis.self = globalThis; }\n' + indexContent;
          }

          fs.writeFileSync(indexPath, indexContent, 'utf-8');
          fs.writeFileSync(mjsPath, indexContent, 'utf-8');
          fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');

          console.log(`[ssr-merge-chunks] Successfully written index.js, index.mjs, and package.json (${(indexContent.length / 1024).toFixed(0)} KB)`);
        },
      },
    ],
  };
});
