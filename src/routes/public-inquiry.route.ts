import type { Elysia } from "elysia";
import { PublicInquiryController } from "../controllers/public-inquiry.controller";
import { ExternalAttachmentRepository } from "../repositories/public/external-attachment.repository";
import { PublicInquiryRepository } from "../repositories/public/public-inquiry.repository";
import { fileService } from "../services/file.service";
import { PublicAttachmentService } from "../services/public-attachment.service";
import { PublicInquiryService } from "../services/public-inquiry.service";

const repo = new PublicInquiryRepository();
const attachmentRepo = new ExternalAttachmentRepository();
const attachmentService = new PublicAttachmentService(
  fileService,
  attachmentRepo,
);
const service = new PublicInquiryService(repo, attachmentService);

export const PublicInquiryRoute = (app: Elysia) =>
  app.use(PublicInquiryController(service));
