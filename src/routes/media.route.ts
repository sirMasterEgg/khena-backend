import type { Elysia } from "elysia";
import { MediaController } from "../controllers/media.controller";
import { MediaRepository } from "../repositories/media.repository";
import { fileService } from "../services/file.service";
import { MediaService } from "../services/media.service";

const repo = new MediaRepository();
const service = new MediaService(repo, fileService);

export const MediaRoute = (app: Elysia) => app.use(MediaController(service));
