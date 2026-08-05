import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import {
  deliveryOverdueItemModel,
  deliveryStatsModel,
  deliveryWeekModel,
} from "../models/response.model";
import type { DeliveryService } from "../services/delivery.service";
import { addDaysIso, isMondayIso } from "../utils/date";
import { BadRequestError } from "../utils/errors";

const isoDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const weekQuery = t.Object({
  start: isoDate, // WAJIB, harus hari Senin
  end: isoDate, // WAJIB, harus hari Minggu, tepat 6 hari setelah start
});

/**
 * Rentang wajib tepat satu minggu penuh Senin–Minggu. Divalidasi manual karena
 * skema Elysia hanya bisa mengecek format, bukan hari apa tanggalnya.
 */
function assertFullWeek(start: string, end: string): void {
  if (!isMondayIso(start)) {
    throw new BadRequestError("start must be a monday");
  }
  if (addDaysIso(start, 6) !== end) {
    throw new BadRequestError("end must be the sunday of the same week");
  }
}

export const DeliveryController = (service: DeliveryService) =>
  new Elysia({ prefix: "/deliveries" })
    .use(authPlugin)
    .get(
      "/stats",
      async () => {
        const data = await service.getStats();
        return { data };
      },
      {
        requirePermission: "delivery.read",
        response: {
          200: dataEnvelope(deliveryStatsModel),
          ...errorResponses,
        },
      },
    )
    .get(
      "/overdue",
      async () => {
        const data = await service.listOverdue();
        return { data };
      },
      {
        requirePermission: "delivery.read",
        response: {
          200: dataEnvelope(t.Array(deliveryOverdueItemModel)),
          ...errorResponses,
        },
      },
    )
    .get(
      "/",
      async ({ query }) => {
        assertFullWeek(query.start, query.end);
        const data = await service.listByWeek({
          start: query.start,
          end: query.end,
        });
        return { data };
      },
      {
        query: weekQuery,
        requirePermission: "delivery.read",
        response: {
          200: dataEnvelope(deliveryWeekModel),
          ...errorResponses,
        },
      },
    );
