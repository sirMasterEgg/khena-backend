import type { Elysia } from "elysia";
import { AuthController } from "../controllers/auth.controller";
import { AuthRepository } from "../repositories/auth.repository";
import { AuthService } from "../services/auth.service";

const repo = new AuthRepository();
const service = new AuthService(repo);

export const AuthRoute = (app: Elysia) => app.use(AuthController(service));
