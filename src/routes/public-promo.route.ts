import type { Elysia } from "elysia";
import { PublicPromoController } from "../controllers/public-promo.controller";
import { CustomerRepository } from "../repositories/customer.repository";
import { PromoRepository } from "../repositories/public/promo.repository";
import { PromoService } from "../services/promo.service";

const repo = new PromoRepository();
const customerRepo = new CustomerRepository();
const service = new PromoService(repo, customerRepo);

export const PublicPromoRoute = (app: Elysia) =>
  app.use(PublicPromoController(service));
