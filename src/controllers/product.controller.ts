import { Elysia, t } from "elysia";
import type { ProductService } from "../services/product.service";

const createProductBody = t.Object({
  productName: t.String({ minLength: 1 }),
  sku: t.String({ minLength: 1 }),
  collectionId: t.String({ minLength: 1 }),
  description: t.String({ minLength: 1 }),
  material: t.String({ minLength: 1 }),
  careInstructions: t.Array(t.String(), { minItems: 1 }),
  productDimension: t.String({ minLength: 1 }),
  boxDimensions: t.String({ minLength: 1 }),
  media: t.Array(t.String(), { minItems: 1 }),
  status: t.String({ minLength: 1 }),
  variant: t.Array(
    t.Object({
      colorId: t.String({ minLength: 1 }),
      sku: t.String({ minLength: 1 }),
      price: t.Number(),
      discountedPrice: t.Number(),
      visibility: t.String({ minLength: 1 }),
      variantMedia: t.Array(t.String(), { minItems: 1 }),
    }),
    { minItems: 1 },
  ),
});

export const ProductController = (service: ProductService) =>
  new Elysia({ prefix: "/products" }).post(
    "/",
    async ({ body, set }) => {
      await service.createProduct(body);
      set.status = 201;
      return { data: "OK" };
    },
    {
      body: createProductBody,
    },
  );
