import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/query': 'http://localhost:3001',
      '/tables': 'http://localhost:3001',
      '/export-file': 'http://localhost:3001'
    }
  }
});
