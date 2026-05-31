import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Frontend tests live in src/. The scripts/ tests use Node's built-in test
    // runner (node --test, see `npm run test:scripts`), not vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
