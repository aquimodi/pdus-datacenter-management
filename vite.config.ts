import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Let Rollup automatically handle chunking
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    // Configuration for frontend development server
    proxy: {
      // Proxy API requests to backend server during development
      '/api': {
        target: process.env.VITE_LOCAL_SERVER_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});