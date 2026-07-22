import type { Elysia } from "elysia";
import { CareInstructionController } from "../controllers/care-instruction.controller";
import { CareInstructionRepository } from "../repositories/care-instruction.repository";
import { CareInstructionService } from "../services/care-instruction.service";

const repo = new CareInstructionRepository();
const service = new CareInstructionService(repo);

export const CareInstructionRoute = (app: Elysia) =>
  app.use(CareInstructionController(service));
