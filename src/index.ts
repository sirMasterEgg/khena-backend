import { Elysia } from "elysia";
import { ProductRoute } from "./routes/product.route";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = new Elysia({ prefix: "/api" })
  .onError(({ code, error, set }) => {
    if (code === "UNKNOWN" && error instanceof Error) {
      set.status = 400;
      return error.message;
    }
  })
  .get("/health", () => ({ status: "ok" }))
  .use(ProductRoute);

app.listen(port, () => {
  console.log(`🦊 Server running at http://localhost:${port}`);
});
