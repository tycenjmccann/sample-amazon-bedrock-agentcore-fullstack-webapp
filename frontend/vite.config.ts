import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the local AgentCore backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Proxy management API requests to the FastAPI backend
      '/management': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/management/, ''),
      },
    },
  },
  define: {
    // Fix for Node.js packages that expect 'global' to be defined
    global: 'globalThis',
  },
  optimizeDeps: {
    // Pre-bundle these dependencies to avoid issues
    include: ['amazon-cognito-identity-js'],
  },
});
