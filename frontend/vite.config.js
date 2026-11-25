import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '..', // usa el .env de la raíz del repositorio
  server: { port: 5173, open: true },
  build: { chunkSizeWarningLimit: 1500 },
});
