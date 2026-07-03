import { Elysia } from "elysia";
import { syncPermissions } from "./auth/permission-sync";
import { AuthRoute } from "./routes/auth.route";
import { CategoryRoute } from "./routes/category.route";
import { CollectionRoute } from "./routes/collection.route";
import { ColorRoute } from "./routes/color.route";
import { FinishRoute } from "./routes/finish.route";
import { MediaRoute } from "./routes/media.route";
import { ProductRoute } from "./routes/product.route";
import { RoomTypeRoute } from "./routes/room-type.route";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Generate & sinkron permission dari Module Registry sebelum server listen.
await syncPermissions();

const app = new Elysia({ prefix: "/api" })
  .onError(({ code, error, set }) => {
    if (code === "UNKNOWN" && error instanceof Error) {
      set.status = 400;
      return error.message;
    }
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
  console.log(`🦊 Server running at http://localhost:${port}`);
});
