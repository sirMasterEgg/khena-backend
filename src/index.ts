import { Elysia } from "elysia";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = new Elysia().get("/health", () => ({ status: "ok" }));

app.listen(port, () => {
  console.log(`🦊 Server running at http://localhost:${port}`);
});
