import type { Elysia } from "elysia";
import { DashboardController } from "../controllers/dashboard.controller";
import { DashboardRepository } from "../repositories/dashboard.repository";
import { DashboardService } from "../services/dashboard.service";

const repo = new DashboardRepository();
const service = new DashboardService(repo);

export const DashboardRoute = (app: Elysia) =>
  app.use(DashboardController(service));
