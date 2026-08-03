import type { Elysia } from "elysia";
import { PurchaseOrderController } from "../controllers/purchase-order.controller";
import { PurchaseOrderRepository } from "../repositories/purchase-order.repository";
import { StockRepository } from "../repositories/stock.repository";
import { SupplierRepository } from "../repositories/supplier.repository";
import { PurchaseOrderService } from "../services/purchase-order.service";

const supplierRepo = new SupplierRepository();
const stockRepo = new StockRepository();
const repo = new PurchaseOrderRepository();
const service = new PurchaseOrderService(repo, supplierRepo, stockRepo);

export const PurchaseOrderRoute = (app: Elysia) =>
  app.use(PurchaseOrderController(service));
