"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import type { inventory, products, warehouses } from "@/lib/db/schema";
import { api } from "./api";
import Field from "./Field";
import { button, dangerOutline, input, muted, primary, table, tableWrap, td, th, tr } from "./styles";

type Warehouse = typeof warehouses.$inferSelect;
type Product = typeof products.$inferSelect;
type Stock = typeof inventory.$inferSelect;

type Props = {
  warehouse: Warehouse;
  products: Product[];
  stock: Stock[];
  run: <T>(action: () => Promise<T>, success?: (result: T) => string) => Promise<boolean>;
};

// Stock of one warehouse: change a quantity, add a product, or remove a product.
export default function WarehouseStock({ warehouse, products, stock, run }: Props) {
  const lines = stock.filter((s) => s.warehouseId === warehouse.id);
  const stocked = new Set(lines.map((s) => s.productId));
  const available = products.filter((p) => !stocked.has(p.id));
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const path = (productId: string) =>
    `/api/inventory/${encodeURIComponent(warehouse.id)}/${encodeURIComponent(productId)}`;

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    const productId = String(data.get("productId"));
    const ok = await run(
      () =>
        api("/api/inventory", "POST", {
          warehouseId: warehouse.id,
          productId,
          quantity: Number(data.get("quantity")),
        }),
      () => `Added ${productName(productId)}.`,
    );
    if (ok) formEl.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      {lines.length === 0 ? (
        <p className={muted}>This warehouse has no stock yet. Add a product below.</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>Quantity</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productId} className={tr}>
                  <td className={td}>
                    {productName(line.productId)}{" "}
                    <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {line.productId}
                    </span>
                  </td>
                  <td className={td}>
                    <form
                      // Remount after a reload so the input shows the stored quantity.
                      key={line.quantity}
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const quantity = Number(new FormData(e.currentTarget).get("quantity"));
                        run(
                          () => api(path(line.productId), "PATCH", { quantity }),
                          () => `Saved quantity of ${productName(line.productId)}.`,
                        );
                      }}
                    >
                      <input
                        name="quantity"
                        type="number"
                        min={0}
                        step={1}
                        required
                        defaultValue={line.quantity}
                        aria-label={`Quantity of ${productName(line.productId)}`}
                        className={`${input} w-28 text-right`}
                      />
                      <button type="submit" className={button}>
                        <Check className="size-4" aria-hidden="true" />
                        Save
                      </button>
                    </form>
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      className={dangerOutline}
                      onClick={() =>
                        run(
                          () => api(path(line.productId), "DELETE"),
                          () => `Removed ${productName(line.productId)}.`,
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Product" className="sm:flex-1">
            <select name="productId" className={input} required defaultValue="">
              <option value="" disabled>
                Select a product
              </option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input name="quantity" type="number" min={0} step={1} required className={`${input} sm:w-28`} />
          </Field>
          <button type="submit" className={primary}>
            <Plus className="size-4" aria-hidden="true" />
            Add product
          </button>
        </form>
      )}
    </div>
  );
}
