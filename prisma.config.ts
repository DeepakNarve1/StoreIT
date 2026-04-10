import fs from "node:fs";
import path from "node:path";
import { defineConfig, env } from "prisma/config"; // ✅ import env from here

function loadDotEnvFileIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFileIfNeeded();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"), // ✅ use env() helper, not process.env
    // Optional in runtime/deploy environments (Render).
    // Needed only for commands that require a shadow DB (migrate dev/diff).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
