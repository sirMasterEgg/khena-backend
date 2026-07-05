import { sql } from "drizzle-orm";
import { permissions } from "../models/permission.model";
import { db } from "../utils/db";
import { logger } from "../utils/logger";
import { generatePermissions } from "./module-registry";

// Upsert semua permission dari registry. Aman dijalankan berulang (idempotent).
export async function syncPermissions(): Promise<void> {
  const rows = generatePermissions();
  if (rows.length === 0) {
    logger.info("permission sync: no permissions to sync");
    return;
  }

  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({
      target: permissions.code,
      set: {
        module: sql`excluded.module`,
        action: sql`excluded.action`,
        description: sql`excluded.description`,
      },
    });

  logger.info({ count: rows.length }, "permission sync completed");
}
