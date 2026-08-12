import type { Elysia } from "elysia";
import { EmploymentTypeController } from "../controllers/employment-type.controller";
import { EmploymentTypeRepository } from "../repositories/employment-type.repository";
import { EmploymentTypeService } from "../services/employment-type.service";

const repo = new EmploymentTypeRepository();
const service = new EmploymentTypeService(repo);

export const EmploymentTypeRoute = (app: Elysia) =>
  app.use(EmploymentTypeController(service));
