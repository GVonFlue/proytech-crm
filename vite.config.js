import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Three pages. index.html is the CRM. proposal.html and onboarding.html are
// the public pages a client opens from a link: each its own small bundle, so a
// client never downloads the CRM, its database client or anything behind the
// login.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        proposal: resolve(__dirname, 'proposal.html'),
        onboarding: resolve(__dirname, 'onboarding.html'),
      },
    },
  },
});
