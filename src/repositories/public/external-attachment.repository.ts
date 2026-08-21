import {
  type ExternalAttachment,
  externalAttachments,
  type NewExternalAttachment,
} from "../../models/external-attachment.model";
import { db } from "../../utils/db";

export class ExternalAttachmentRepository {
  async create(data: NewExternalAttachment): Promise<ExternalAttachment> {
    const result = await db
      .insert(externalAttachments)
      .values(data)
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create external attachment");
    }
    return row;
  }
}
