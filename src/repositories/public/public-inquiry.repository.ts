import {
  type Inquiry,
  inquiries,
  type NewInquiry,
} from "../../models/inquiry.model";
import { db } from "../../utils/db";

export class PublicInquiryRepository {
  async create(data: NewInquiry): Promise<Inquiry> {
    const result = await db.insert(inquiries).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create inquiry");
    }
    return row;
  }
}
