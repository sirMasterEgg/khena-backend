import { isNull, sql } from "drizzle-orm";
import { permissions } from "../models/permission.model";
import { runWithActor } from "../utils/actor-context";
import { stampCreate, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";
import { logger } from "../utils/logger";
import { generatePermissions } from "./module-registry";

// Upsert semua permission dari registry. Aman dijalankan berulang (idempotent).
export async function syncPermissions(): Promise<void> {
  // Jalan saat startup, di luar konteks request — tanpa ini getActor() null.
  // Actor "System" menandai baris yang dibuat mesin, supaya saat audit dibaca
  // jelas bedanya dari baris buatan manusia (yang berisi email admin).
  return runWithActor("System", async () => {
    const rows = generatePermissions();
    if (rows.length === 0) {
      logger.info("permission sync: no permissions to sync");
      return;
    }

    await db
      .insert(permissions)
      .values(rows.map(stampCreate))
      .onConflictDoUpdate({
        target: permissions.code,
        targetWhere: isNull(permissions.deletedAt),
        set: stampUpdate({
          module: sql`excluded.module`,
          action: sql`excluded.action`,
          description: sql`excluded.description`,
        }),
      });

    logger.info({ count: rows.length }, "permission sync completed");
  });
}
