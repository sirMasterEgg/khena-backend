import type { Elysia } from "elysia";
import { DiscountController } from "../controllers/discount.controller";
import { DiscountRepository } from "../repositories/discount.repository";
import { DiscountService } from "../services/discount.service";

const repo = new DiscountRepository();
const service = new DiscountService(repo);

export const DiscountRoute = (app: Elysia) =>
  app.use(DiscountController(service));
