import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { syncPermissions } from "./auth/permission-sync";
import { userAuth } from "./auth/user-auth";
import { userAuthConfig } from "./config/user-auth.config";
import { loggerPlugin } from "./plugins/logger.plugin";
import { AdministratorRoute } from "./routes/administrator.route";
import { ApplicantRoute } from "./routes/applicant.route";
import { AuthRoute } from "./routes/auth.route";
import { CareInstructionRoute } from "./routes/care-instruction.route";
import { CategoryRoute } from "./routes/category.route";
import { CollectionRoute } from "./routes/collection.route";
import { ColorRoute } from "./routes/color.route";
import { CustomerRoute } from "./routes/customer.route";
import { DashboardRoute } from "./routes/dashboard.route";
import { DeliveryRoute } from "./routes/delivery.route";
import { DepartmentRoute } from "./routes/department.route";
import { DiscountRoute } from "./routes/discount.route";
import { EmploymentTypeRoute } from "./routes/employment-type.route";
import { FinishRoute } from "./routes/finish.route";
import { InquiryRoute } from "./routes/inquiry.route.ts";
import { JobRoute } from "./routes/job.route";
import { MarketplaceRoute } from "./routes/marketplace.route";
import { MediaRoute } from "./routes/media.route";
import { OrderSalesRoute } from "./routes/order-sales.route";
import { PermissionRoute } from "./routes/permission.route";
import { PointOfSaleRoute } from "./routes/point-of-sale.route";
import { ProductRoute } from "./routes/product.route";
import { PurchaseOrderRoute } from "./routes/purchase-order.route";
import { RoleRoute } from "./routes/role.route";
import { RoomTypeRoute } from "./routes/room-type.route";
import { StockRoute } from "./routes/stock.route";
import { SupplierRoute } from "./routes/supplier.route";
import { AppError, errorBody } from "./utils/errors";
import { logger } from "./utils/logger";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Generate & sinkron permission dari Module Registry sebelum server listen.
await syncPermissions();

// Handler better-auth (auth user) di-mount sebagai instance terpisah. Route
// hasil mount melewati .onError() di bawah dan plugin openapi() — itu memang
// konsekuensi yang diterima: response-nya memakai format native better-auth,
// bukan envelope { data } / { error } milik API ini.
const userAuthPlugin = new Elysia({ name: "user-auth" }).mount(
  userAuth.handler,
);

// Semua endpoint milik dashboard admin hidup di bawah /api/admin.
// Auth user (better-auth, /api/auth) dan /api/health sengaja berada di luar
// group ini karena bukan milik admin.
const adminApi = new Elysia({ prefix: "/admin" })
  .use(AuthRoute)
  .use(AdministratorRoute)
  .use(RoleRoute)
  .use(PermissionRoute)
  .use(ProductRoute)
  .use(MediaRoute)
  .use(RoomTypeRoute)
  .use(CategoryRoute)
  .use(CollectionRoute)
  .use(FinishRoute)
  .use(ColorRoute)
  .use(CareInstructionRoute)
  .use(CustomerRoute)
  .use(SupplierRoute)
  .use(PurchaseOrderRoute)
  .use(DiscountRoute)
  .use(PointOfSaleRoute)
  .use(OrderSalesRoute)
  .use(StockRoute)
  .use(DeliveryRoute)
  .use(MarketplaceRoute)
  .use(DepartmentRoute)
  .use(EmploymentTypeRoute)
  .use(JobRoute)
  .use(ApplicantRoute)
  .use(InquiryRoute)
  .use(DashboardRoute);

const app = new Elysia({ prefix: "/api" })
  .use(
    cors({
      // Sesi better-auth memakai cookie, jadi credentials wajib true — dan
      // wildcard "*" tidak boleh dipakai bersamanya, origin harus eksplisit.
      origin: [userAuthConfig.appPublicUrl, userAuthConfig.adminAppUrl],
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }),
  )
  .use(openapi())
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
  .use(userAuthPlugin)
  .use(adminApi);

app.listen(port, () => {
  logger.info(`🦊 Server running at http://localhost:${port}`);
});
