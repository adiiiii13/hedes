import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  
  return {
    server: {
      port: 5174,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    build: {
      target: 'esnext',
    },
    ssr: {
      noExternal: isBuild ? true : undefined,
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
      reactRouter(),
      tsconfigPaths(),
    ],
  };
});
