import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_STAMP__: JSON.stringify(process.env.BUILD_STAMP || 'dev'),
  },
  server: { host: '0.0.0.0', port: 5173, watch: { usePolling: true } },
})
