import type { Elysia } from "elysia";
import { PublicCollectionController } from "../controllers/public-collection.controller";
import { PublicCollectionRepository } from "../repositories/public/public-collection.repository";
import { PublicCollectionService } from "../services/public-collection.service";

const repo = new PublicCollectionRepository();
const service = new PublicCollectionService(repo);

export const PublicCollectionRoute = (app: Elysia) =>
  app.use(PublicCollectionController(service));
