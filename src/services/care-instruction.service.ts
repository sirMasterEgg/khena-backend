import type { CareInstructionRepository } from "../repositories/care-instruction.repository";

interface ListCareInstructionsInput {
  page: number;
  limit: number;
}

export class CareInstructionService {
  constructor(private readonly repo: CareInstructionRepository) {}

  async listCareInstructions(input: ListCareInstructionsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(page, limit);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }
}
