import type { Elysia } from "elysia";
import { RoleController } from "../controllers/role.controller";
import { RoleRepository } from "../repositories/role.repository";
import { RoleService } from "../services/role.service";

const repo = new RoleRepository();
const service = new RoleService(repo);

export const RoleRoute = (app: Elysia) => app.use(RoleController(service));
