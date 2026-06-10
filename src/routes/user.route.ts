import { Elysia } from "elysia";
import * as userController from "../controllers/user.controller";

export function registerUserRoutes(app: Elysia) {
  app.group("/users", (app) =>
    app
      .get("/", () => userController.getAllUsers())
      .get("/:id", ({ params }) => userController.getUserById(Number(params.id)))
      .post("/", (ctx) => userController.createUser(ctx))
      .put("/:id", (ctx) => userController.updateUser(ctx, Number(ctx.params.id)))
      .delete("/:id", ({ params }) => userController.deleteUser(Number(params.id)))
  );

  return app;
}
