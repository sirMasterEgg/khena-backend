import type { Elysia } from "elysia";
import { ApplicantController } from "../controllers/applicant.controller";
import { ApplicantRepository } from "../repositories/applicant.repository";
import { ApplicantService } from "../services/applicant.service";

const repo = new ApplicantRepository();
const service = new ApplicantService(repo);

export const ApplicantRoute = (app: Elysia) =>
  app.use(ApplicantController(service));
