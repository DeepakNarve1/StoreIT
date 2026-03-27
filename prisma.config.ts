import "dotenv/config";
import { defineConfig, env } from "prisma/config"; // ✅ import env from here

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"), // ✅ use env() helper, not process.env
    // Optional in runtime/deploy environments (Render).
    // Needed only for commands that require a shadow DB (migrate dev/diff).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
