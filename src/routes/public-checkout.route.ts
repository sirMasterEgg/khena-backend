import type { Elysia } from "elysia";
import { PublicCheckoutController } from "../controllers/public-checkout.controller";
import { CustomerRepository } from "../repositories/customer.repository";
import { OrderSalesRepository } from "../repositories/order-sales.repository";
import { PromoRepository } from "../repositories/public/promo.repository";
import { StockRepository } from "../repositories/stock.repository";
import { BiteshipService } from "../services/biteship.service";
import { CustomerService } from "../services/customer.service";
import { MidtransService } from "../services/midtrans.service";
import { PromoService } from "../services/promo.service";
import { PublicCheckoutService } from "../services/public-checkout.service";

const orderRepo = new OrderSalesRepository();
const stockRepo = new StockRepository();
const customerRepo = new CustomerRepository();
const customerService = new CustomerService(customerRepo);
const biteship = new BiteshipService();
const promoRepo = new PromoRepository();
const promoService = new PromoService(promoRepo, customerRepo);
const midtrans = new MidtransService();
const service = new PublicCheckoutService(
  orderRepo,
  stockRepo,
  customerRepo,
  customerService,
  biteship,
  promoService,
  midtrans,
);

export const PublicCheckoutRoute = (app: Elysia) =>
  app.use(PublicCheckoutController(service));
