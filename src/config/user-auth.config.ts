function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

// Konfigurasi auth USER (pengguna website, ditangani better-auth). Auth
// administrator punya config sendiri di auth.config.ts — dua modul yang
// sengaja tidak berbagi secret maupun cookie.
export const userAuthConfig = {
  secret: required("BETTER_AUTH_SECRET"),
  baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // Dipakai dua kali: whitelist CORS (credentials: true melarang wildcard) dan
  // trustedOrigins better-auth.
  appPublicUrl: required("APP_PUBLIC_URL"),
  adminAppUrl: required("ADMIN_APP_URL"),
};
