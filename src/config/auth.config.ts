function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

export const authConfig = {
  jwtSecret: required("JWT_SECRET"),
  csrfSecret: required("CSRF_SECRET"),
  preSessionSecret: required("PRE_SESSION_SECRET"),
  accessTtl: Number(process.env.ACCESS_TOKEN_TTL ?? 900),
  refreshTtl: Number(process.env.REFRESH_TOKEN_TTL ?? 1209600),
  preSessionTtl: Number(process.env.PRE_SESSION_TTL ?? 1800),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
};
