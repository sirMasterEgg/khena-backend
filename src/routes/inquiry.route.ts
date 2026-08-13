import type { Elysia } from "elysia";
import { InquiryController } from "../controllers/inquiry.controller";
import { InquiryRepository } from "../repositories/inquiry.repository";
import { InquiryService } from "../services/inquiry.service";

const repo = new InquiryRepository();
const service = new InquiryService(repo);

export const InquiryRoute = (app: Elysia) =>
  app.use(InquiryController(service));
