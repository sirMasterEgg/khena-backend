import type { Elysia } from "elysia";
import { PublicPageController } from "../controllers/public-page.controller";
import { PublicPageRepository } from "../repositories/public/public-page.repository";
import { PublicPageService } from "../services/public-page.service";

const repo = new PublicPageRepository();
const service = new PublicPageService(repo);

export const PublicPageRoute = (app: Elysia) =>
  app.use(PublicPageController(service));
