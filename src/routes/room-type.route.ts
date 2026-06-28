import type { Elysia } from "elysia";
import { RoomTypeController } from "../controllers/room-type.controller";
import { RoomTypeRepository } from "../repositories/room-type.repository";
import { RoomTypeService } from "../services/room-type.service";

const repo = new RoomTypeRepository();
const service = new RoomTypeService(repo);

export const RoomTypeRoute = (app: Elysia) =>
  app.use(RoomTypeController(service));
