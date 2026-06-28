import type { Elysia } from "elysia";
import { CategoryController } from "../controllers/category.controller";
import { CategoryRepository } from "../repositories/category.repository";
import { RoomTypeRepository } from "../repositories/room-type.repository";
import { CategoryService } from "../services/category.service";

const categoryRepo = new CategoryRepository();
const roomTypeRepo = new RoomTypeRepository();
const service = new CategoryService(categoryRepo, roomTypeRepo);

export const CategoryRoute = (app: Elysia) =>
  app.use(CategoryController(service));
