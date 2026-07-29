import type { Elysia } from "elysia";
import { CustomerController } from "../controllers/customer.controller";
import { CustomerRepository } from "../repositories/customer.repository";
import { CustomerService } from "../services/customer.service";

const repo = new CustomerRepository();
const service = new CustomerService(repo);

export const CustomerRoute = (app: Elysia) =>
  app.use(CustomerController(service));
