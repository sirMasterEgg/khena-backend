import { t } from "elysia";

/**
 * Skema response khusus endpoint publik (storefront). Terpisah dari
 * response.model.ts (dashboard admin) karena bentuknya sengaja berbeda —
 * mis. field publik tidak pernah membocorkan status/visibility internal.
 */

const nullableString = t.Union([t.String(), t.Null()]);

/**
 * Ringkasan produk (varian pertama) — bentuknya identik di 4 endpoint:
 * GET /products, GET /products/:id/related, POST /wishlists, GET /wishlists.
 * Lihat issue #98 §6.3.
 */
export const productSummaryModel = t.Object({
  id: t.String(),
  name: t.String(),
  sku: t.String(), // products.base_sku
  image: nullableString,
  price: t.Number(),
  discountPercent: t.Number(),
  priceAfterDiscount: t.Number(),
  stock: t.Number(),
});

// ---- Pages ----

export const publicPageModel = t.Object({
  id: t.String(),
  page: t.String(),
  section: t.String(),
  data: t.Unknown(),
});

// ---- Categories ----

export const publicCategoryItemModel = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
});

export const publicRoomTypeWithCategoriesModel = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  categories: t.Array(publicCategoryItemModel),
});

// ---- Products ----

const publicDimensionModel = t.Object({
  width: t.Union([t.Number(), t.Null()]),
  depth: t.Union([t.Number(), t.Null()]),
  height: t.Union([t.Number(), t.Null()]),
  weight: t.Union([t.Number(), t.Null()]),
  image: nullableString,
});

const publicVariantColorModel = t.Object({
  id: t.String(),
  name: t.String(),
  hexCode: t.String(),
});

const publicProductVariantModel = t.Object({
  id: t.String(),
  sku: t.String(),
  image: nullableString,
  color: publicVariantColorModel,
  price: t.Number(),
  discountPercent: t.Number(),
  priceAfterDiscount: t.Number(),
  stock: t.Number(),
});

export const publicProductDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  sku: t.String(),
  description: nullableString,
  materialAndCare: t.Object({
    materials: nullableString,
    careInstructions: t.Array(t.String()),
  }),
  dimensions: t.Object({
    product: publicDimensionModel,
    box: publicDimensionModel,
  }),
  media: t.Array(t.String()),
  variants: t.Array(publicProductVariantModel),
});

// ---- Collections ----

export const publicCollectionListItemModel = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  coverImage: nullableString,
  heroImage: nullableString,
  totalProducts: t.Number(),
  hasSoldOutProduct: t.Boolean(),
});

// ---- Wishlists ----

export const publicWishlistItemModel = t.Object({
  id: t.String(),
  product: productSummaryModel,
});

// ---- Careers ----

const publicCareerRelationModel = t.Object({
  id: t.String(),
  name: t.String(),
});

export const publicCareerListItemModel = t.Object({
  id: t.String(),
  slug: t.String(),
  positionTitle: t.String(),
  employmentType: publicCareerRelationModel,
  department: publicCareerRelationModel,
  location: t.String(),
});

export const publicCareerDetailModel = t.Object({
  ...publicCareerListItemModel.properties,
  roleDescription: t.String(),
  requirements: t.String(),
  benefits: nullableString,
});

// ---- Simple message responses ----

export const publicMessageModel = t.Object({ message: t.String() });
