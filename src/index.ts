import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import { syncPermissions } from "./auth/permission-sync";
import { loggerPlugin } from "./plugins/logger.plugin";
import { AuthRoute } from "./routes/auth.route";
import { CategoryRoute } from "./routes/category.route";
import { CollectionRoute } from "./routes/collection.route";
import { ColorRoute } from "./routes/color.route";
import { FinishRoute } from "./routes/finish.route";
import { MediaRoute } from "./routes/media.route";
import { ProductRoute } from "./routes/product.route";
import { RoomTypeRoute } from "./routes/room-type.route";
import { AppError, errorBody } from "./utils/errors";
import { logger } from "./utils/logger";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Generate & sinkron permission dari Module Registry sebelum server listen.
await syncPermissions();

const app = new Elysia({ prefix: "/api" })
  .use(cors())
  .use(loggerPlugin)
  .onError(({ code, error, set }) => {
    // Error bisnis yang dilempar service/repository sebagai AppError.
    if (error instanceof AppError) {
      set.status = error.httpStatus;
      return errorBody(error.code, error.message, error.details);
    }

    // Error validasi skema Elysia (body/query/params).
    if (code === "VALIDATION") {
      set.status = 422;
      return errorBody("VALIDATION_ERROR", "validation failed", error.all);
    }

    // Route tidak ditemukan.
    if (code === "NOT_FOUND") {
      set.status = 404;
      return errorBody("NOT_FOUND", "route not found");
    }

    // Unique violation dari Postgres (kode 23505). Bisa terjadi pada race
    // condition dua request bersamaan yang lolos pengecekan duplikat di service.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      set.status = 400;
      return errorBody("CONFLICT", "data already exists");
    }

    // Sisanya: error tak terduga. Log detailnya (termasuk stack trace lewat
    // serializer `err` bawaan pino), tapi jangan bocorkan ke client.
    logger.error({ err: error }, "unhandled error");
    set.status = 500;
    return errorBody("INTERNAL_ERROR", "internal server error");
  })
  .get("/health", () => ({ status: "ok" }))
  .use(AuthRoute)
  .use(ProductRoute)
  .use(MediaRoute)
  .use(RoomTypeRoute)
  .use(CategoryRoute)
  .use(CollectionRoute)
  .use(FinishRoute)
  .use(ColorRoute);

app.listen(port, () => {
  logger.info(`🦊 Server running at http://localhost:${port}`);
});
