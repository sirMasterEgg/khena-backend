-- Seed media_categories
INSERT INTO media_categories (id, name, created_at, updated_at) VALUES
('01880000-0000-0000-0000-000000000001', 'Product Images', NOW(), NOW());

-- Seed media
INSERT INTO media (id, file_name, file_key, file_type, media_category_id, created_at, updated_at) VALUES
('01880000-0000-0000-0000-000000000101', 'dimension-file.pdf', 'dimension-filekey', 'pdf', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000102', 'box-file.pdf', 'box-filekey', 'pdf', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000103', 'product-image-1.jpg', 'product-image-1-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000104', 'product-image-2.jpg', 'product-image-2-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000105', 'variant-image-1.jpg', 'variant-image-1-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000106', 'variant-image-2.jpg', 'variant-image-2-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000107', 'variant-image-3.jpg', 'variant-image-3-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW()),
('01880000-0000-0000-0000-000000000108', 'variant-image-4.jpg', 'variant-image-4-key', 'jpg', '01880000-0000-0000-0000-000000000001', NOW(), NOW());

-- Seed finishes
INSERT INTO finishes (id, name, created_at, updated_at) VALUES
('01880000-0000-0000-0000-000000000201', 'Matte', NOW(), NOW());

-- Seed colors
INSERT INTO colors (id, name, hex_code, finishes_id, created_at, updated_at) VALUES
('01880000-0000-0000-0000-000000000301', 'Red', 'FF0000', '01880000-0000-0000-0000-000000000201', NOW(), NOW()),
('01880000-0000-0000-0000-000000000302', 'Blue', '0000FF', '01880000-0000-0000-0000-000000000201', NOW(), NOW());

-- Seed collections
INSERT INTO collections (id, name, slug, created_at, updated_at) VALUES
('01880000-0000-0000-0000-000000000401', 'Furniture Collection', 'furniture-collection', NOW(), NOW());
