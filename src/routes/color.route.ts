import type { Elysia } from "elysia";
import { ColorController } from "../controllers/color.controller";
import { ColorRepository } from "../repositories/color.repository";
import { ColorService } from "../services/color.service";

const repo = new ColorRepository();
const service = new ColorService(repo);

export const ColorRoute = (app: Elysia) => app.use(ColorController(service));
