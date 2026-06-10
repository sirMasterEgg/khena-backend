import { UserRepository } from "../repositories/user.repository";
import type { NewUser } from "../models/schema";

const userRepository = new UserRepository();

export class UserService {
  async getAllUsers() {
    return await userRepository.findAll();
  }

  async getUserById(id: number) {
    const result = await userRepository.findById(id);
    if (result.length === 0) {
      throw new Error("User not found");
    }
    return result[0];
  }

  async createUser(name: string, email: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing.length > 0) {
      throw new Error("Email already exists");
    }
    const result = await userRepository.create({ name, email });
    return result[0];
  }

  async updateUser(id: number, name?: string, email?: string) {
    const data: Record<string, string> = {};
    if (name) data.name = name;
    if (email) data.email = email;

    const result = await userRepository.update(id, data);
    if (result.length === 0) {
      throw new Error("User not found");
    }
    return result[0];
  }

  async deleteUser(id: number) {
    const result = await userRepository.delete(id);
    if (result.length === 0) {
      throw new Error("User not found");
    }
    return result[0];
  }
}
