-- 0015 (applied via MCP 2026-06-29): reviews.image_url + get_conversations dükkan adı
-- (COALESCE(shop.name, full_name)) + file_report TÜM admin token'larına push (iOS+Android).
-- Tam SQL: bkz. MCP apply_migration 0015_reviews_img_conv_shopname_report_alltokens.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS image_url text;
-- get_conversations & file_report CREATE OR REPLACE (dükkan adı + multi-token push) MCP ile uygulandı.
