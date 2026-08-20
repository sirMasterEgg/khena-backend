import { and, eq, ne } from "drizzle-orm";
import { auth_users } from "../models/auth-schema";
import { db } from "../utils/db";

/**
 * Satu-satunya tempat yang query tabel user better-auth dari kode kita
 * sendiri. Operasi tulis (insert user, update password, dsb.) tetap milik
 * better-auth lewat adapter Drizzle — di sini hanya baca untuk keperluan
 * validasi.
 */
export class UserAuthRepository {
  /** Cari akun dengan nomor telepon tsb, opsional kecualikan satu user (untuk update profil). */
  async findByPhone(
    phone: string,
    excludeUserId?: string,
  ): Promise<{ id: string } | undefined> {
    const conditions = [eq(auth_users.phone, phone)];
    if (excludeUserId) {
      conditions.push(ne(auth_users.id, excludeUserId));
    }

    const result = await db
      .select({ id: auth_users.id })
      .from(auth_users)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }
}
