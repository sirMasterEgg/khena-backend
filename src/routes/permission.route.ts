import type { Elysia } from "elysia";
import { PermissionController } from "../controllers/permission.controller";
import { PermissionRepository } from "../repositories/permission.repository";
import { PermissionService } from "../services/permission.service";

const repo = new PermissionRepository();
const service = new PermissionService(repo);

export const PermissionRoute = (app: Elysia) =>
  app.use(PermissionController(service));
