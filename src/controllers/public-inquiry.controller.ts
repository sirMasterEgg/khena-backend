import { Elysia, t } from "elysia";
import { dataEnvelope, publicErrorResponses } from "../models/api-schema";
import { publicMessageModel } from "../models/public-response.model";
import type { PublicInquiryService } from "../services/public-inquiry.service";

// Batas ukuran lapis pertama di schema — validasi tipe asli file (magic
// bytes) tetap dilakukan di service (issue #98 §6.4, §8).
const MAX_PUBLIC_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const submitBody = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email" }),
  phone: t.String({ minLength: 1 }),
  subject: t.String({ minLength: 1 }),
  message: t.String({ minLength: 1 }),
  attachment: t.Optional(t.File({ maxSize: MAX_PUBLIC_ATTACHMENT_BYTES })),
});

export const PublicInquiryController = (service: PublicInquiryService) =>
  new Elysia({ prefix: "/inquiries" }).post(
    "/",
    async ({ body, set }) => {
      const attachment = body.attachment
        ? {
            name: body.attachment.name || "(unnamed)",
            type: body.attachment.type,
            body: Buffer.from(await body.attachment.arrayBuffer()),
          }
        : undefined;

      const data = await service.submitInquiry({
        name: body.name,
        email: body.email,
        phone: body.phone,
        subject: body.subject,
        message: body.message,
        attachment,
      });
      set.status = 201;
      return { data };
    },
    {
      body: submitBody,
      response: {
        201: dataEnvelope(publicMessageModel),
        ...publicErrorResponses,
      },
    },
  );
