import { Elysia, t } from "elysia";
import {
  dataEnvelope,
  listEnvelope,
  publicErrorResponses,
} from "../models/api-schema";
import {
  publicCareerDetailModel,
  publicCareerListItemModel,
  publicMessageModel,
} from "../models/public-response.model";
import type { PublicCareerService } from "../services/public-career.service";

const MAX_PUBLIC_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

// Menerima UUID atau slug (job sudah punya slug sejak Tahap 1) — lihat
// issue #98 §12.2. Validasi mana yang mana dilakukan di repository.
const idParams = t.Object({ id: t.String({ minLength: 1 }) });

const applyBody = t.Object({
  // jobId hanya menerima UUID — form lamaran mengirim id dari halaman detail.
  jobId: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email" }),
  phone: t.String({ minLength: 1 }),
  message: t.Optional(t.String()),
  attachment: t.Optional(t.File({ maxSize: MAX_PUBLIC_ATTACHMENT_BYTES })),
});

export const PublicCareerController = (service: PublicCareerService) =>
  new Elysia({ prefix: "/careers" })
    .get(
      "/",
      async ({ query }) => {
        return await service.listCareers({
          page: query.page ?? 1,
          limit: query.limit ?? 10,
        });
      },
      {
        query: listQuery,
        response: {
          200: listEnvelope(publicCareerListItemModel),
          ...publicErrorResponses,
        },
      },
    )
    .post(
      "/apply",
      async ({ body, set }) => {
        const attachment = body.attachment
          ? {
              name: body.attachment.name || "(unnamed)",
              type: body.attachment.type,
              body: Buffer.from(await body.attachment.arrayBuffer()),
            }
          : undefined;

        const data = await service.applyToCareer({
          jobId: body.jobId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          message: body.message,
          attachment,
        });
        set.status = 201;
        return { data };
      },
      {
        body: applyBody,
        response: {
          201: dataEnvelope(publicMessageModel),
          ...publicErrorResponses,
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const data = await service.getCareerDetail(params.id);
        return { data };
      },
      {
        params: idParams,
        response: {
          200: dataEnvelope(publicCareerDetailModel),
          ...publicErrorResponses,
        },
      },
    );
