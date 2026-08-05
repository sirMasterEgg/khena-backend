import type { Elysia } from "elysia";
import { DeliveryController } from "../controllers/delivery.controller";
import { DeliveryRepository } from "../repositories/delivery.repository";
import { DeliveryService } from "../services/delivery.service";

const repo = new DeliveryRepository();
const service = new DeliveryService(repo);

export const DeliveryRoute = (app: Elysia) =>
  app.use(DeliveryController(service));
