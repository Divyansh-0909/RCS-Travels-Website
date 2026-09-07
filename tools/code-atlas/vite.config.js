import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    host: '127.0.0.1',
    port: 4178,
  },
  preview: {
    host: '127.0.0.1',
    port: 4178,
  },
  build: {
    target: 'es2022',
  },
});
