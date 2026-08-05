import type { Elysia } from "elysia";
import { OrderSalesController } from "../controllers/order-sales.controller";
import { CustomerRepository } from "../repositories/customer.repository";
import { OrderSalesRepository } from "../repositories/order-sales.repository";
import { ProductRepository } from "../repositories/product.repository";
import { StockRepository } from "../repositories/stock.repository";
import { BiteshipService } from "../services/biteship.service";
import { CustomerService } from "../services/customer.service";
import { OrderSalesService } from "../services/order-sales.service";

const repo = new OrderSalesRepository();
const customerRepo = new CustomerRepository();
const productRepo = new ProductRepository();
const stockRepo = new StockRepository();
const biteship = new BiteshipService();
const customerService = new CustomerService(customerRepo);
const service = new OrderSalesService(
  repo,
  customerRepo,
  productRepo,
  stockRepo,
  biteship,
  customerService,
);

export const OrderSalesRoute = (app: Elysia) =>
  app.use(OrderSalesController(service));
