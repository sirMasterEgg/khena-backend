import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type Folder, folders, type NewFolder } from "../models/folder.model";
import { type Media, media, type NewMedia } from "../models/media.model";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

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
      );
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
    const result = await conn.insert(folders).values(data).returning();
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
      .set({ ...data, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    const folder = result[0];
    if (!folder) {
      throw new Error("failed to update folder");
    }
    return folder;
  }

  async softDeleteFolders(
    ids: string[],
    actorName: string,
    tx: DbOrTx,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await tx
      .update(folders)
      .set({ deletedAt: new Date(), deletedBy: actorName })
      .where(inArray(folders.id, ids));
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

  async findMediaByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) {
      return [];
    }
    return await db
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), isNull(media.deletedAt)));
  }

  async findMediaByFolderId(folderId: string | null): Promise<Media[]> {
    return await db
      .select()
      .from(media)
      .where(
        and(
          folderId === null
            ? isNull(media.folderId)
            : eq(media.folderId, folderId),
          isNull(media.deletedAt),
        ),
      );
  }

  async createMedia(data: NewMedia, tx?: DbOrTx): Promise<Media> {
    const conn = tx ?? db;
    const result = await conn.insert(media).values(data).returning();
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
      .set({ ...data, updatedAt: new Date() })
      .where(eq(media.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update media");
    }
    return row;
  }

  async softDeleteMedia(
    id: string,
    actorName: string,
    tx?: DbOrTx,
  ): Promise<void> {
    const conn = tx ?? db;
    await conn
      .update(media)
      .set({ deletedAt: new Date(), deletedBy: actorName })
      .where(eq(media.id, id));
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
    actorName: string,
    tx: DbOrTx,
  ): Promise<void> {
    if (folderIds.length === 0) {
      return;
    }
    await tx
      .update(media)
      .set({ deletedAt: new Date(), deletedBy: actorName })
      .where(inArray(media.folderId, folderIds));
  }
}
