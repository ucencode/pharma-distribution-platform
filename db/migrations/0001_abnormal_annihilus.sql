-- Zero-pads n to at least `width` digits; longer numbers are kept whole.
CREATE FUNCTION padded_id(prefix text, n bigint, width int) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT prefix || lpad(n::text, greatest(width, length(n::text)), '0') $$;--> statement-breakpoint
CREATE SEQUENCE "public"."categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."warehouses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" SET DEFAULT padded_id('C', nextval('categories_id_seq'), 2);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "id" SET DEFAULT padded_id('P', nextval('products_id_seq'), 3);--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "id" SET DEFAULT padded_id('W', nextval('warehouses_id_seq'), 2);--> statement-breakpoint
-- Continue after the highest existing ID so new IDs do not collide with existing rows.
SELECT setval('categories_id_seq', coalesce((SELECT max(substring(id from 2)::bigint) FROM categories WHERE id ~ '^C[0-9]+$'), 0) + 1, false);--> statement-breakpoint
SELECT setval('products_id_seq', coalesce((SELECT max(substring(id from 2)::bigint) FROM products WHERE id ~ '^P[0-9]+$'), 0) + 1, false);--> statement-breakpoint
SELECT setval('warehouses_id_seq', coalesce((SELECT max(substring(id from 2)::bigint) FROM warehouses WHERE id ~ '^W[0-9]+$'), 0) + 1, false);
