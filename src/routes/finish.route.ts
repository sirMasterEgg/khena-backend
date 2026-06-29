import type { Elysia } from "elysia";
import { FinishController } from "../controllers/finish.controller";
import { FinishRepository } from "../repositories/finish.repository";
import { FinishService } from "../services/finish.service";

const repo = new FinishRepository();
const service = new FinishService(repo);

export const FinishRoute = (app: Elysia) => app.use(FinishController(service));
