import { Elysia } from "elysia";
import { CategoryRoute } from "./routes/category.route";
import { CollectionRoute } from "./routes/collection.route";
import { MediaRoute } from "./routes/media.route";
import { ProductRoute } from "./routes/product.route";
import { RoomTypeRoute } from "./routes/room-type.route";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = new Elysia({ prefix: "/api" })
  .onError(({ code, error, set }) => {
    if (code === "UNKNOWN" && error instanceof Error) {
      set.status = 400;
      return error.message;
    }
  })
  .get("/health", () => ({ status: "ok" }))
  .use(ProductRoute)
  .use(MediaRoute)
  .use(RoomTypeRoute)
  .use(CategoryRoute)
  .use(CollectionRoute);

app.listen(port, () => {
  console.log(`🦊 Server running at http://localhost:${port}`);
});
