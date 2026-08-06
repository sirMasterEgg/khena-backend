import { asc, isNull } from "drizzle-orm";
import { type Permission, permissions } from "../models/permission.model";
import { db } from "../utils/db";

export class PermissionRepository {
  async listAll(): Promise<Permission[]> {
    return await db
      .select()
      .from(permissions)
      .where(isNull(permissions.deletedAt))
      .orderBy(asc(permissions.module), asc(permissions.action));
  }
}
