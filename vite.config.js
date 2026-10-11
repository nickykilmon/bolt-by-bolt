import { defineConfig } from 'vite';

// 'npm start' (vite preview) serves the built game; Render web services pass the port in PORT.
export default defineConfig({
  preview: { host: '0.0.0.0', port: Number(process.env.PORT) || 4173, strictPort: true, allowedHosts: true },
});
