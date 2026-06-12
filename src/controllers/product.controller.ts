import { Elysia } from "elysia";
import { ProductService } from "../services/product.service";

interface CreateProductVariant {
  colorId?: unknown;
  sku?: unknown;
  price?: unknown;
  discountedPrice?: unknown;
  visibility?: unknown;
  variantMedia?: unknown;
}

interface CreateProductBody {
  productName?: unknown;
  sku?: unknown;
  collectionId?: unknown;
  description?: unknown;
  material?: unknown;
  careInstructions?: unknown;
  productDimension?: unknown;
  boxDimensions?: unknown;
  media?: unknown;
  status?: unknown;
  variant?: unknown;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function validateCreateProductBody(body: CreateProductBody): string[] {
  const errors: string[] = [];

  const requiredTopLevelFields = [
    "productName",
    "sku",
    "collectionId",
    "description",
    "material",
    "careInstructions",
    "productDimension",
    "boxDimensions",
    "media",
    "status",
    "variant",
  ];

  for (const field of requiredTopLevelFields) {
    if (isEmptyValue(body[field as keyof CreateProductBody])) {
      errors.push(`${field} is required`);
    }
  }

  // Validate variant items
  if (Array.isArray(body.variant) && body.variant.length > 0) {
    for (let i = 0; i < body.variant.length; i++) {
      const variantItem = body.variant[i] as CreateProductVariant;

      if (
        variantItem.colorId === undefined ||
        variantItem.colorId === null ||
        (typeof variantItem.colorId === "string" &&
          variantItem.colorId.trim() === "")
      ) {
        errors.push(`variant[${i}].colorId is required`);
      }

      if (
        variantItem.sku === undefined ||
        variantItem.sku === null ||
        (typeof variantItem.sku === "string" && variantItem.sku.trim() === "")
      ) {
        errors.push(`variant[${i}].sku is required`);
      }

      if (variantItem.price === undefined || variantItem.price === null) {
        errors.push(`variant[${i}].price is required`);
      }

      if (
        variantItem.discountedPrice === undefined ||
        variantItem.discountedPrice === null
      ) {
        errors.push(`variant[${i}].discountedPrice is required`);
      }

      if (
        variantItem.visibility === undefined ||
        variantItem.visibility === null ||
        (typeof variantItem.visibility === "string" &&
          variantItem.visibility.trim() === "")
      ) {
        errors.push(`variant[${i}].visibility is required`);
      }

      if (
        !Array.isArray(variantItem.variantMedia) ||
        variantItem.variantMedia.length === 0
      ) {
        errors.push(`variant[${i}].variantMedia is required`);
      }
    }
  }

  return errors;
}

export const ProductController = (service: ProductService) =>
  new Elysia({ prefix: "/api/products" }).post("/", async ({ body, set }) => {
    const requestBody = body as CreateProductBody;
    const validationErrors = validateCreateProductBody(requestBody);

    if (validationErrors.length > 0) {
      set.status = 400;
      return { errors: validationErrors };
    }

    try {
      await service.createProduct({
        productName: requestBody.productName as string,
        sku: requestBody.sku as string,
        collectionId: requestBody.collectionId as string,
        description: requestBody.description as string,
        material: requestBody.material as string,
        careInstructions: requestBody.careInstructions as string[],
        productDimension: requestBody.productDimension as string,
        boxDimensions: requestBody.boxDimensions as string,
        media: requestBody.media as string[],
        status: requestBody.status as string,
        variant: (requestBody.variant as any[]).map((v) => ({
          colorId: v.colorId as string,
          sku: v.sku as string,
          price: v.price as number,
          discountedPrice: v.discountedPrice as number,
          visibility: v.visibility as string,
          variantMedia: v.variantMedia as string[],
        })),
      });

      set.status = 201;
      return { data: "OK" };
    } catch (error) {
      set.status = 400;
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      return { errors: [errorMessage] };
    }
  });
