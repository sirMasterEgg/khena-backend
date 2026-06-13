import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/models",
  out: "./drizzle",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: We are sure that DATABASE_URL will be provided in the environment variables.
    url: process.env.DATABASE_URL!,
  },
});
