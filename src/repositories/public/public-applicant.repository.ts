import {
  type Applicant,
  applicants,
  type NewApplicant,
} from "../../models/applicant.model";
import { db } from "../../utils/db";

export class PublicApplicantRepository {
  async create(data: NewApplicant): Promise<Applicant> {
    const result = await db.insert(applicants).values(data).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create applicant");
    }
    return row;
  }
}
