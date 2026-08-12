import type { DepartmentRepository } from "../repositories/department.repository";

export class DepartmentService {
  constructor(private readonly repo: DepartmentRepository) {}

  async listDepartments() {
    const rows = await this.repo.list();
    return { data: rows };
  }
}
