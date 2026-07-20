import type { Elysia } from "elysia";
import { FinishController } from "../controllers/finish.controller";
import { ColorRepository } from "../repositories/color.repository";
import { FinishRepository } from "../repositories/finish.repository";
import { FinishService } from "../services/finish.service";

const repo = new FinishRepository();
const colorRepo = new ColorRepository();
const service = new FinishService(repo, colorRepo);

export const FinishRoute = (app: Elysia) => app.use(FinishController(service));
