import { pino } from "pino";

const isProduction = process.env.NODE_ENV === "production";

// Level default per environment (AWS best practice #3): production cukup `warn`
// ke atas untuk menekan volume log; development verbose (`debug`) agar mudah
// ditelusuri. Bisa dioverride lewat env `LOG_LEVEL`.
const level = process.env.LOG_LEVEL ?? (isProduction ? "warn" : "debug");

// Redaction (AWS best practice #4): kredensial, token, dan session id tidak
// pernah boleh masuk log — diganti `[REDACTED]` sebelum ditulis.
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['set-cookie']",
    // Nested (satu level) sesuai spesifikasi issue, plus varian top-level agar
    // field sensitif tetap ter-mask di mana pun ia dicatat.
    "*.password",
    "*.accessToken",
    "*.refreshToken",
    "*.sessionId",
    "password",
    "accessToken",
    "refreshToken",
    "sessionId",
  ],
  censor: "[REDACTED]",
};

// Development: transport `pino-pretty` agar output terbaca manusia.
// Production: JSON terstruktur polos ke stdout, siap dikonsumsi CloudWatch /
// agregator log.
export const logger = pino({
  level,
  redact,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});
