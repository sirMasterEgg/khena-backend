import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { type Folder, folders, type NewFolder } from "../models/folder.model";
import { type Media, media, type NewMedia } from "../models/media.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

export interface MediaListFilter {
  folderId: string | null; // diabaikan jika search terisi
  search?: string;
  type?: string;
  sort: "name" | "createdAt" | "sizeBytes";
  order: "asc" | "desc";
}

export class MediaRepository {
  // ---- folders ----

  async findFolderByPath(path: string): Promise<Folder | undefined> {
    const result = await db
      .select()
      .from(folders)
      .where(and(eq(folders.path, path), isNull(folders.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findFolderById(id: string): Promise<Folder | undefined> {
    const result = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findSubFolders(parentId: string | null): Promise<Folder[]> {
    return await db
      .select()
      .from(folders)
      .where(
        and(
          parentId === null
            ? isNull(folders.parentId)
            : eq(folders.parentId, parentId),
          isNull(folders.deletedAt),
        ),
      )
      .orderBy(asc(folders.name));
  }

  /**
   * All non-deleted folders whose path is exactly `path` or nested under it
   * (i.e. starts with `path + "/"`). Used for cascade rename & delete.
   */
  async findFolderSubtree(path: string): Promise<Folder[]> {
    return await db
      .select()
      .from(folders)
      .where(
        and(
          sql`(${folders.path} = ${path} OR ${folders.path} LIKE ${`${path}/%`})`,
          isNull(folders.deletedAt),
        ),
      );
  }

  async createFolder(data: NewFolder, tx?: DbOrTx): Promise<Folder> {
    const conn = tx ?? db;
    const result = await conn
      .insert(folders)
      .values(stampCreate(data))
      .returning();
    const folder = result[0];
    if (!folder) {
      throw new Error("failed to create folder");
    }
    return folder;
  }

  async updateFolder(
    id: string,
    data: Partial<NewFolder>,
    tx: DbOrTx,
  ): Promise<Folder> {
    const result = await tx
      .update(folders)
      .set(stampUpdate(data))
      .where(eq(folders.id, id))
      .returning();
    const folder = result[0];
    if (!folder) {
      throw new Error("failed to update folder");
    }
    return folder;
  }

  async softDeleteFolders(ids: string[], tx: DbOrTx): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await tx.update(folders).set(stampDelete()).where(inArray(folders.id, ids));
  }

  // ---- media ----

  async findMediaById(id: string): Promise<Media | undefined> {
    const result = await db
      .select()
      .from(media)
      .where(and(eq(media.id, id), isNull(media.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findMediaByObjectKey(objectKey: string): Promise<Media | undefined> {
    const result = await db
      .select()
      .from(media)
      .where(and(eq(media.objectKey, objectKey), isNull(media.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findMediaByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), isNull(media.deletedAt)));
  }

  async findMediaByFolderId(filter: MediaListFilter): Promise<Media[]> {
    const conditions = [isNull(media.deletedAt)];

    // Saat search terisi, cari di SEMUA folder (abaikan folder aktif).
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(media.name, pattern),
          ilike(media.originalName, pattern),
        ) as (typeof conditions)[number],
      );
    } else {
      conditions.push(
        filter.folderId === null
          ? isNull(media.folderId)
          : eq(media.folderId, filter.folderId),
      );
    }

    if (filter.type) {
      conditions.push(eq(media.type, filter.type));
    }

    const sortColumn = {
      name: media.name,
      createdAt: media.createdAt,
      sizeBytes: media.sizeBytes,
    }[filter.sort];

    return await db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(filter.order === "asc" ? asc(sortColumn) : desc(sortColumn));
  }

  async createMedia(data: NewMedia, tx?: DbOrTx): Promise<Media> {
    const conn = tx ?? db;
    const result = await conn
      .insert(media)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create media");
    }
    return row;
  }

  async updateMedia(
    id: string,
    data: Partial<NewMedia>,
    tx?: DbOrTx,
  ): Promise<Media> {
    const conn = tx ?? db;
    const result = await conn
      .update(media)
      .set(stampUpdate(data))
      .where(eq(media.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update media");
    }
    return row;
  }

  async softDeleteMedia(id: string, tx?: DbOrTx): Promise<void> {
    const conn = tx ?? db;
    await conn.update(media).set(stampDelete()).where(eq(media.id, id));
  }

  async findMediaByFolderIds(folderIds: string[]): Promise<Media[]> {
    if (folderIds.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(media)
      .where(and(inArray(media.folderId, folderIds), isNull(media.deletedAt)));
  }

  async softDeleteMediaByFolderIds(
    folderIds: string[],
    tx: DbOrTx,
  ): Promise<void> {
    if (folderIds.length === 0) {
      return;
    }
    await tx
      .update(media)
      .set(stampDelete())
      .where(inArray(media.folderId, folderIds));
  }
}
