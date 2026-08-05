import type { Elysia } from "elysia";
import { AdministratorController } from "../controllers/administrator.controller";
import { AdministratorRepository } from "../repositories/administrator.repository";
import { AdministratorService } from "../services/administrator.service";

const repo = new AdministratorRepository();
const service = new AdministratorService(repo);

export const AdministratorRoute = (app: Elysia) =>
  app.use(AdministratorController(service));
