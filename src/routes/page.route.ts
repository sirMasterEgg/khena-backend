import type { Elysia } from "elysia";
import { PageController } from "../controllers/page.controller";
import { PageRepository } from "../repositories/page.repository";
import { fileService } from "../services/file.service";
import { PageService } from "../services/page.service";

const repo = new PageRepository();
const service = new PageService(repo, fileService);

export const PageRoute = (app: Elysia) => app.use(PageController(service));
