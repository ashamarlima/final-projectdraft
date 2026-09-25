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

    //Vitest reads this from the same config, so a test renders a component
    //through the same React and JSX transform the app is built with.
    test: {
      //components are rendered into a DOM, not a bare node process
      environment: 'jsdom',

      //the matchers from @testing-library/jest-dom are added here
      setupFiles: './src/test/setup.js',

      include: ['src/**/*.test.{js,jsx}'],

      //Anything a test replaced with vi.spyOn/vi.fn is put back
      //afterwards, so one test cannot change how the next one behaves.
      restoreMocks: true,
    },
  }
})
