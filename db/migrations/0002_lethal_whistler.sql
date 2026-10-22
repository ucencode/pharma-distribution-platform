CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"departure_day" text NOT NULL,
	"departure_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"notes" text,
	CONSTRAINT "departure_day_valid" CHECK ("deliveries"."departure_day" IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
	CONSTRAINT "duration_positive" CHECK ("deliveries"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;