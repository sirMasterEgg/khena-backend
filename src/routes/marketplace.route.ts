import type { Elysia } from "elysia";
import { MarketplaceController } from "../controllers/marketplace.controller";
import { MarketplaceRepository } from "../repositories/marketplace.repository";
import { StockRepository } from "../repositories/stock.repository";
import { MarketplaceService } from "../services/marketplace.service";

const repo = new MarketplaceRepository();
const stockRepo = new StockRepository();
const service = new MarketplaceService(repo, stockRepo);

export const MarketplaceRoute = (app: Elysia) =>
  app.use(MarketplaceController(service));
