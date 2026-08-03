import type { Elysia } from "elysia";
import { PointOfSaleController } from "../controllers/point-of-sale.controller";
import { CustomerRepository } from "../repositories/customer.repository";
import { PointOfSaleRepository } from "../repositories/point-of-sale.repository";
import { ProductRepository } from "../repositories/product.repository";
import { StockRepository } from "../repositories/stock.repository";
import { PointOfSaleService } from "../services/point-of-sale.service";

const repo = new PointOfSaleRepository();
const customerRepo = new CustomerRepository();
const productRepo = new ProductRepository();
const stockRepo = new StockRepository();
const service = new PointOfSaleService(
  repo,
  customerRepo,
  productRepo,
  stockRepo,
);

export const PointOfSaleRoute = (app: Elysia) =>
  app.use(PointOfSaleController(service));
