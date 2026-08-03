import type { Elysia } from "elysia";
import { StockController } from "../controllers/stock.controller";
import { StockRepository } from "../repositories/stock.repository";
import { StockService } from "../services/stock.service";

const repo = new StockRepository();
const service = new StockService(repo);

export const StockRoute = (app: Elysia) => app.use(StockController(service));
