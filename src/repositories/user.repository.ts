import { db } from "../utils/db";
import { users, type NewUser } from "../models/schema";
import { eq } from "drizzle-orm";

export class UserRepository {
  async findAll() {
    return await db.select().from(users);
  }

  async findById(id: number) {
    return await db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  async findByEmail(email: string) {
    return await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
  }

  async create(user: NewUser) {
    return await db.insert(users).values(user).returning();
  }

  async update(
    id: number,
    data: Partial<NewUser>
  ) {
    return await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
  }

  async delete(id: number) {
    return await db.delete(users).where(eq(users.id, id)).returning();
  }
}