import { Elysia, t } from "elysia";
import { authPlugin } from "../auth/auth.plugin";
import { dataEnvelope, errorResponses } from "../models/api-schema";
import {
  dashboardModel,
  dashboardPendingModel,
} from "../models/response.model";
import type { DashboardService } from "../services/dashboard.service";
import { addDaysIso, todayIso } from "../utils/date";
import { BadRequestError } from "../utils/errors";

const isoDate = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const dashboardQuery = t.Object({
  start_date: t.Optional(isoDate),
  end_date: t.Optional(isoDate),
  group_by: t.Optional(
    t.Union([t.Literal("day"), t.Literal("week"), t.Literal("month")]),
  ),
});

const pendingQuery = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
});

export const DashboardController = (service: DashboardService) =>
  new Elysia({ prefix: "/dashboard" })
    .use(authPlugin)
    .get(
      "/",
      async ({ query }) => {
        const endDate = query.end_date ?? todayIso();
        const startDate = query.start_date ?? addDaysIso(endDate, -29);
        if (startDate > endDate) {
          throw new BadRequestError(
            "start_date must be before or equal to end_date",
          );
        }
        const data = await service.getDashboard({
          startDate,
          endDate,
          groupBy: query.group_by ?? "day",
        });
        return { data };
      },
      {
        query: dashboardQuery,
        requirePermission: "dashboard.read",
        response: { 200: dataEnvelope(dashboardModel), ...errorResponses },
      },
    )
    .get(
      "/pending",
      async ({ query }) => {
        const data = await service.getPending({ limit: query.limit ?? 5 });
        return { data };
      },
      {
        query: pendingQuery,
        requirePermission: "dashboard.read",
        response: {
          200: dataEnvelope(dashboardPendingModel),
          ...errorResponses,
        },
      },
    );
