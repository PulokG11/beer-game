import { defineConfig } from '@neon/config/v1';

// Neon branch config. `neon deploy --env <file>` (run by .github/workflows/deploy.yml) reads the
// function env below from process.env / the env file.
export default defineConfig({
  functions: {
    api: {
      name: 'beer game api',
      source: 'functions/api/index.ts',
      env: {
        NEON_REALTIME_URL:    process.env.NEON_REALTIME_URL!,
        NEON_REALTIME_SECRET: process.env.NEON_REALTIME_SECRET!,
        ALLOWED_ORIGINS:      process.env.ALLOWED_ORIGINS!,
        BUILD_SHA:            process.env.BUILD_SHA ?? 'dev',
      },
    },
  },
  preview: {
    realtime: { allowedOrigins: ['https://pulokg11.github.io', 'http://localhost:3000'] },
  },
});
