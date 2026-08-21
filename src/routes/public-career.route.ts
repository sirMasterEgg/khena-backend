import type { Elysia } from "elysia";
import { PublicCareerController } from "../controllers/public-career.controller";
import { ExternalAttachmentRepository } from "../repositories/public/external-attachment.repository";
import { PublicApplicantRepository } from "../repositories/public/public-applicant.repository";
import { PublicCareerRepository } from "../repositories/public/public-career.repository";
import { fileService } from "../services/file.service";
import { PublicAttachmentService } from "../services/public-attachment.service";
import { PublicCareerService } from "../services/public-career.service";

const repo = new PublicCareerRepository();
const applicantRepo = new PublicApplicantRepository();
const attachmentRepo = new ExternalAttachmentRepository();
const attachmentService = new PublicAttachmentService(
  fileService,
  attachmentRepo,
);
const service = new PublicCareerService(repo, applicantRepo, attachmentService);

export const PublicCareerRoute = (app: Elysia) =>
  app.use(PublicCareerController(service));
