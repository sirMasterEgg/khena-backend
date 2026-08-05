import type { PermissionRepository } from "../repositories/permission.repository";

export class PermissionService {
  constructor(private readonly repo: PermissionRepository) {}

  async listPermissions() {
    const rows = await this.repo.listAll();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      module: row.module,
      action: row.action,
      description: row.description,
    }));
  }
}
