import { z } from "zod";

const nonEmpty = (o: object) => Object.keys(o).length > 0;

export const categoryCreateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const categoryUpdateSchema = categoryCreateSchema
  .omit({ id: true })
  .partial()
  .refine(nonEmpty, "No fields to update");

export const productCreateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  requiresColdChain: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema
  .omit({ id: true })
  .partial()
  .refine(nonEmpty, "No fields to update");

export const warehouseCreateSchema = z.object({
  id: z.string().trim().min(1),
  city: z.string().trim().min(1),
  distanceToCustomerKm: z.number().nonnegative(),
  hasColdStorage: z.boolean().optional(),
  hasRefrigeratedFleet: z.boolean().optional(),
});

export const warehouseUpdateSchema = warehouseCreateSchema
  .omit({ id: true })
  .partial()
  .refine(nonEmpty, "No fields to update");

export const inventoryCreateSchema = z.object({
  warehouseId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  quantity: z.number().int().nonnegative(),
});

export const inventoryUpdateSchema = inventoryCreateSchema.pick({ quantity: true });
