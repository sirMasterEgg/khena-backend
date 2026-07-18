import { eq } from "drizzle-orm";
import {
  type Administrator,
  administrators,
} from "../models/administrator.model";
import {
  type AdministratorSession,
  administratorSessions,
  type NewAdministratorSession,
} from "../models/administrator-session.model";
import { permissions } from "../models/permission.model";
import { rolePermissions } from "../models/role-permission.model";
import { roles } from "../models/role.model";
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

  // Ambil administrator beserta nama role via leftJoin (roleId nullable, jadi
  // admin tanpa role tetap kebaca dengan role = null).
  async findAdministratorWithRoleById(id: string) {
    const result = await db
      .select({
        id: administrators.id,
        name: administrators.name,
        email: administrators.email,
        role: roles.name,
      })
      .from(administrators)
      .leftJoin(roles, eq(administrators.roleId, roles.id))
      .where(eq(administrators.id, id))
      .limit(1);
    return result[0];
  }

  // Varian by email untuk login: sertakan password agar bisa diverifikasi
  // dalam satu query (tanpa query kedua untuk role).
  async findAdministratorWithRoleByEmail(email: string) {
    const result = await db
      .select({
        id: administrators.id,
        name: administrators.name,
        email: administrators.email,
        password: administrators.password,
        role: roles.name,
      })
      .from(administrators)
      .leftJoin(roles, eq(administrators.roleId, roles.id))
      .where(eq(administrators.email, email))
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

  async findSessionById(id: string): Promise<AdministratorSession | undefined> {
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
