import type { Elysia } from "elysia";
import { SupplierController } from "../controllers/supplier.controller";
import { SupplierRepository } from "../repositories/supplier.repository";
import { SupplierService } from "../services/supplier.service";

const repo = new SupplierRepository();
const service = new SupplierService(repo);

export const SupplierRoute = (app: Elysia) =>
  app.use(SupplierController(service));
