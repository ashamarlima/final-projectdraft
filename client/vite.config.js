import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Backend origin for the dev proxy. Set VITE_API_URL in
  // client/.env (or the shell) to point at another backend.
  const env = loadEnv(mode, '.', 'VITE_')
  const apiTarget = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
