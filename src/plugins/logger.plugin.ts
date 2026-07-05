import { Elysia } from "elysia";
import { logger } from "../utils/logger";

// Waktu mulai per-request. WeakMap dikunci ke objek Request sehingga isolasi
// antar request terjaga (tidak seperti `store` yang dibagi seluruh app) dan
// entry-nya otomatis ter-GC saat request selesai.
const requestStart = new WeakMap<Request, number>();

// Plugin request logging: satu baris log per request (method, path, status,
// durasi ms). Level ditentukan status code — 5xx `error`, 4xx `warn`, sisanya
// `debug` (AWS best practice #1 & #2). Dengan default level production `warn`,
// request sukses otomatis tidak tercatat di production tapi tetap terlihat saat
// development.
//
// Sengaja TIDAK mencatat body (bisa berisi file besar / password) maupun query
// string mentah (bisa berisi data sensitif).
export const loggerPlugin = new Elysia({ name: "logger" })
  .onRequest(({ request }) => {
    requestStart.set(request, performance.now());
  })
  .onAfterResponse(({ request, path, set }) => {
    const start = requestStart.get(request);
    requestStart.delete(request);
    const durationMs = start
      ? Math.round((performance.now() - start) * 100) / 100
      : 0;

    const status = typeof set.status === "number" ? set.status : 200;
    const line = { method: request.method, path, status, durationMs };

    if (status >= 500) {
      logger.error(line, "request");
    } else if (status >= 400) {
      logger.warn(line, "request");
    } else {
      logger.debug(line, "request");
    }
  })
  // Angkat hook ke scope global agar berlaku untuk semua route yang di-`use`
  // setelah plugin ini, bukan hanya instance plugin (yang tidak punya route).
  .as("global");
