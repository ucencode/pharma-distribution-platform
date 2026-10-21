"use client";

import { Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { products, warehouses } from "@/lib/db/schema";
import type { Decision } from "@/lib/engine";
import { api } from "./api";
import Alert from "./Alert";
import Field from "./Field";
import PageHeader from "./PageHeader";
import ResultCard from "./ResultCard";
import { button, dangerOutline, input, primary } from "./styles";

type Product = typeof products.$inferSelect;
type Warehouse = typeof warehouses.$inferSelect;
type Line = { productId: string; quantity: string };

const blankLine: Line = { productId: "", quantity: "" };

export default function OrderForm() {
  const [productList, setProductList] = useState<Product[]>([]);
  const [warehouseList, setWarehouseList] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<Line[]>([blankLine]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Product[]>("/api/products"), api<Warehouse[]>("/api/warehouses")])
      .then(([p, w]) => {
        setProductList(p);
        setWarehouseList(w);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const update = (index: number, change: Partial<Line>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDecision(null);
    try {
      const items = lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
      setDecision(await api<Decision>("/api/orders/evaluate", "POST", { items }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Order" />
      <Alert variant="error" message={error} />

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {lines.map((line, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <Field label="Product" className="min-w-0 flex-1 basis-64">
              <select
                className={input}
                required
                value={line.productId}
                onChange={(e) => update(i, { productId: e.target.value })}
              >
                <option value="">Select a product</option>
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" className="w-32">
              <input
                className={input}
                type="number"
                min={1}
                step={1}
                required
                value={line.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
            </Field>
            <button
              type="button"
              className={`${dangerOutline} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={lines.length === 1}
              aria-label={`Remove line ${i + 1}`}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        ))}

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className={button} onClick={() => setLines([...lines, blankLine])}>
            <Plus className="size-4" aria-hidden="true" />
            Add line
          </button>
          <button type="submit" className={primary}>
            <Play className="size-4" aria-hidden="true" />
            Evaluate
          </button>
        </div>
      </form>

      {decision && (
        <ResultCard decision={decision} productList={productList} warehouseList={warehouseList} />
      )}
    </div>
  );
}
