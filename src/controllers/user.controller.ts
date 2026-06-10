import { UserService } from "../services/user.service";
import type { Context } from "elysia";

const userService = new UserService();

export async function getAllUsers() {
  return await userService.getAllUsers();
}

export async function getUserById(id: number) {
  return await userService.getUserById(id);
}

export async function createUser(ctx: Context) {
  const body = await ctx.request.json() as { name: string; email: string };
  if (!body.name || !body.email) {
    ctx.set.status = 400;
    return { error: "name and email are required" };
  }
  return await userService.createUser(body.name, body.email);
}

export async function updateUser(ctx: Context, id: number) {
  const body = (await ctx.request.json()) as { name?: string; email?: string };
  return await userService.updateUser(id, body.name, body.email);
}

export async function deleteUser(id: number) {
  return await userService.deleteUser(id);
}
