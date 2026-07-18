/**
 * Centralised, validated access to environment variables.
 * Server-only. Never import this from a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const env = {
  appUrl: optional("APP_URL", "http://localhost:3000"),
  betterAuthSecret: optional(
    "BETTER_AUTH_SECRET",
    // A non-empty dev fallback keeps local `next build` working; production
    // must set a real secret (documented in README / .env.example).
    "dev-insecure-secret-change-me-in-production-0000",
  ),
  databaseUrl: () => required("DATABASE_URL"),
  smtp: {
    host: optional("SMTP_HOST"),
    port: Number(optional("SMTP_PORT", "587")),
    user: optional("SMTP_USER"),
    pass: optional("SMTP_PASS"),
    from: optional("SMTP_FROM", "Band Manager <noreply@example.com>"),
  },
  admin: {
    email: optional("ADMIN_EMAIL"),
    password: optional("ADMIN_PASSWORD"),
  },
  uploadDir: optional("UPLOAD_DIR", "./uploads"),
  maxUploadMb: Number(optional("MAX_UPLOAD_MB", "25")),
  defaultTz: optional("DEFAULT_TZ", "Europe/Berlin"),
  seedDemo: optional("SEED_DEMO", "false").toLowerCase() === "true",
  enableScheduler: optional("ENABLE_SCHEDULER", "false").toLowerCase() === "true",
} as const;

export const maxUploadBytes = env.maxUploadMb * 1024 * 1024;
