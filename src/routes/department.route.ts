import type { Elysia } from "elysia";
import { DepartmentController } from "../controllers/department.controller";
import { DepartmentRepository } from "../repositories/department.repository";
import { DepartmentService } from "../services/department.service";

const repo = new DepartmentRepository();
const service = new DepartmentService(repo);

export const DepartmentRoute = (app: Elysia) =>
  app.use(DepartmentController(service));
