import { eq } from "drizzle-orm";
import {
  type AdministratorSession,
  administratorSessions,
  type NewAdministratorSession,
} from "../models/administrator-session.model";
import {
  type Administrator,
  administrators,
} from "../models/administrator.model";
import { permissions } from "../models/permission.model";
import { rolePermissions } from "../models/role-permission.model";
import { db } from "../utils/db";

export class AuthRepository {
  async findAdministratorByEmail(
    email: string,
  ): Promise<Administrator | undefined> {
    const result = await db
      .select()
      .from(administrators)
      .where(eq(administrators.email, email))
      .limit(1);
    return result[0];
  }

  async findAdministratorById(id: string): Promise<Administrator | undefined> {
    const result = await db
      .select()
      .from(administrators)
      .where(eq(administrators.id, id))
      .limit(1);
    return result[0];
  }

  async createSession(
    data: NewAdministratorSession,
  ): Promise<AdministratorSession> {
    const result = await db
      .insert(administratorSessions)
      .values(data)
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create session");
    }
    return row;
  }

  async findSessionByTokenHash(
    hash: string,
  ): Promise<AdministratorSession | undefined> {
    const result = await db
      .select()
      .from(administratorSessions)
      .where(eq(administratorSessions.tokenHash, hash))
      .limit(1);
    return result[0];
  }

  async findSessionById(
    id: string,
  ): Promise<AdministratorSession | undefined> {
    const result = await db
      .select()
      .from(administratorSessions)
      .where(eq(administratorSessions.id, id))
      .limit(1);
    return result[0];
  }

  async revokeSession(id: string): Promise<void> {
    await db
      .update(administratorSessions)
      .set({ revoked: true })
      .where(eq(administratorSessions.id, id));
  }

  async findPermissionCodesByRoleId(roleId: string): Promise<string[]> {
    const rows = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((row) => row.code);
  }
}
