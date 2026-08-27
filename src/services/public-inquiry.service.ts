import type { PublicInquiryRepository } from "../repositories/public/public-inquiry.repository";
import { logger } from "../utils/logger";
import type { PublicAttachmentService } from "./public-attachment.service";

interface SubmitInquiryAttachment {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
}

interface SubmitInquiryInput {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  attachment?: SubmitInquiryAttachment;
}

export class PublicInquiryService {
  constructor(
    private readonly repo: PublicInquiryRepository,
    private readonly attachmentService: PublicAttachmentService,
  ) {}

  async submitInquiry(input: SubmitInquiryInput): Promise<{ message: string }> {
    const attachmentId = input.attachment
      ? await this.attachmentService.upload(input.attachment, "inquiries")
      : undefined;

    const created = await this.repo.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      subject: input.subject,
      message: input.message,
      attachment: attachmentId,
    });

    logger.info({ inquiryId: created.id }, "public inquiry submitted");
    return { message: "inquiry sent successfully" };
  }
}
