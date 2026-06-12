import { Elysia } from "elysia";
import { ProductRoute } from "./routes/product.route";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .use(ProductRoute);

app.listen(port, () => {
  console.log(`🦊 Server running at http://localhost:${port}`);
});
