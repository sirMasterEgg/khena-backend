import type { Elysia } from "elysia";
import { RoomTypeController } from "../controllers/room-type.controller";
import { CategoryRepository } from "../repositories/category.repository";
import { RoomTypeRepository } from "../repositories/room-type.repository";
import { RoomTypeService } from "../services/room-type.service";

const repo = new RoomTypeRepository();
const categoryRepo = new CategoryRepository();
const service = new RoomTypeService(repo, categoryRepo);

export const RoomTypeRoute = (app: Elysia) =>
  app.use(RoomTypeController(service));
