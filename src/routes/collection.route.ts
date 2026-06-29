import type { Elysia } from "elysia";
import { CollectionController } from "../controllers/collection.controller";
import { CollectionRepository } from "../repositories/collection.repository";
import { CollectionService } from "../services/collection.service";

const repo = new CollectionRepository();
const service = new CollectionService(repo);

export const CollectionRoute = (app: Elysia) =>
  app.use(CollectionController(service));
