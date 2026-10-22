"use client";

import { Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { products, warehouses } from "@/lib/db/schema";
import { DAYS, type Day, type Decision, type Departure } from "@/lib/engine";
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

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

// Current day and time in Jakarta (WIB), the time zone of the customer.
function jakartaNow(): Departure {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return { day: part("weekday") as Day, time: `${part("hour")}:${part("minute")}` };
}

export default function OrderForm() {
  const [productList, setProductList] = useState<Product[]>([]);
  const [warehouseList, setWarehouseList] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<Line[]>([blankLine]);
  const [mode, setMode] = useState<"now" | "simulate">("now");
  const [now, setNow] = useState<Departure | null>(null);
  const [day, setDay] = useState<Day>("Mon");
  const [hour, setHour] = useState("08:00");
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

  // The clock is read in the browser only, so the server-rendered HTML has no time in it.
  useEffect(() => {
    const tick = () => setNow(jakartaNow());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const update = (index: number, change: Partial<Line>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDecision(null);
    try {
      const items = lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
      const departure = mode === "now" ? jakartaNow() : { day, time: hour };
      setDecision(await api<Decision>("/api/orders/evaluate", "POST", { items, departure }));
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Departure</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" checked={mode === "now"} onChange={() => setMode("now")} />
            Use current time{now && ` (${now.day} ${now.time.replace(/^0/, "")} WIB)`}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "simulate"}
              onChange={() => setMode("simulate")}
            />
            Simulate time
          </label>
          {mode === "simulate" && (
            <div className="flex flex-wrap items-end gap-3 pl-6">
              <Field label="Day" className="w-32">
                <select className={input} value={day} onChange={(e) => setDay(e.target.value as Day)}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Time" className="w-32">
                <select className={input} value={hour} onChange={(e) => setHour(e.target.value)}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </fieldset>

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
