import type { EmploymentTypeRepository } from "../repositories/employment-type.repository";

export class EmploymentTypeService {
  constructor(private readonly repo: EmploymentTypeRepository) {}

  async listEmploymentTypes() {
    const rows = await this.repo.list();
    return { data: rows };
  }
}
