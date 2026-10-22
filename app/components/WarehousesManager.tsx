"use client";

import { Boxes, Package, Plus, Snowflake, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import type { inventory, products, warehouses } from "@/lib/db/schema";
import { api } from "./api";
import Alert from "./Alert";
import Badge from "./Badge";
import Checkbox from "./Checkbox";
import Dialog from "./Dialog";
import Field from "./Field";
import FormActions from "./FormActions";
import ListState from "./ListState";
import PageHeader from "./PageHeader";
import RowActions from "./RowActions";
import { button, input, primary, table, tableWrap, td, th, tr } from "./styles";
import WarehouseStock from "./WarehouseStock";

type Warehouse = typeof warehouses.$inferSelect;
type Product = typeof products.$inferSelect;
type Stock = typeof inventory.$inferSelect;

const blank = {
  city: "",
  distanceToCustomerKm: "",
  hasColdStorage: false,
  hasRefrigeratedFleet: false,
};

export default function WarehousesManager() {
  const [rows, setRows] = useState<Warehouse[] | null>(null);
  const [prods, setProds] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [form, setForm] = useState(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    Promise.all([
      api<Warehouse[]>("/api/warehouses"),
      api<Product[]>("/api/products"),
      api<Stock[]>("/api/inventory"),
    ])
      .then(([w, p, s]) => {
        setRows(w);
        setProds(p);
        setStock(s);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function run<T>(action: () => Promise<T>, success?: (result: T) => string) {
    setError("");
    setNotice("");
    try {
      const result = await action();
      await load();
      if (success) setNotice(success(result));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fields = { ...form, distanceToCustomerKm: Number(form.distanceToCustomerKm) };
    const ok = await run(
      () =>
        editing
          ? api<Warehouse>(`/api/warehouses/${encodeURIComponent(editing)}`, "PATCH", fields)
          : api<Warehouse>("/api/warehouses", "POST", fields),
      (row) => `Saved warehouse ${row.id}.`,
    );
    if (ok) close();
  }

  function openAdd() {
    setEditing(null);
    setForm(blank);
    setError("");
    setFormOpen(true);
  }

  function edit(row: Warehouse) {
    setEditing(row.id);
    setForm({
      city: row.city,
      distanceToCustomerKm: String(row.distanceToCustomerKm),
      hasColdStorage: row.hasColdStorage,
      hasRefrigeratedFleet: row.hasRefrigeratedFleet,
    });
    setError("");
    setFormOpen(true);
  }

  function close() {
    setFormOpen(false);
    setEditing(null);
    setForm(blank);
  }

  function openStock(id: string) {
    setError("");
    setNotice("");
    setStockFor(id);
  }

  const selected = rows?.find((w) => w.id === stockFor);
  const alerts = (
    <>
      <Alert variant="error" message={error} />
      <Alert variant="success" message={notice} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Warehouses">
        <button type="button" className={primary} onClick={openAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add warehouse
        </button>
      </PageHeader>

      {!formOpen && !selected && alerts}

      <ListState rows={rows} noun="warehouses">
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>ID</th>
                <th className={th}>City</th>
                <th className={`${th} text-right`}>Distance (km)</th>
                <th className={th}>
                  <span className="sr-only">Cold chain capability</span>
                </th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <tr key={row.id} className={tr}>
                  <td className={`${td} font-mono`}>{row.id}</td>
                  <td className={td}>{row.city}</td>
                  <td className={`${td} text-right tabular-nums`}>{row.distanceToCustomerKm}</td>
                  <td className={td}>
                    <div className="flex gap-2">
                      {row.hasColdStorage && (
                        <Badge variant="blue" title="Can store cold-chain products">
                          <Package className="size-3.5" aria-hidden="true" />
                          <Snowflake className="size-3.5" aria-hidden="true" />
                          Cold Storage
                        </Badge>
                      )}
                      {row.hasRefrigeratedFleet && (
                        <Badge variant="lightBlue" title="Can deliver cold-chain products">
                          <Truck className="size-3.5" aria-hidden="true" />
                          <Snowflake className="size-3.5" aria-hidden="true" />
                          Refrigerated Fleet
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className={td}>
                    <RowActions
                      onEdit={() => edit(row)}
                      onDelete={() =>
                        run(
                          () => api(`/api/warehouses/${encodeURIComponent(row.id)}`, "DELETE"),
                          () => `Deleted warehouse ${row.id}.`,
                        )
                      }
                    >
                      <button type="button" className={button} onClick={() => openStock(row.id)}>
                        <Boxes className="size-4" aria-hidden="true" />
                        Stock
                      </button>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>

      <Dialog
        open={formOpen}
        title={editing ? `Edit warehouse ${editing}` : "Add warehouse"}
        onClose={close}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Alert variant="error" message={error} />
          <Field label="City">
            <input
              className={input}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              required
            />
          </Field>
          <Field label="Distance to customer (km)">
            <input
              className={input}
              type="number"
              min={0}
              step="0.01"
              value={form.distanceToCustomerKm}
              onChange={(e) => setForm({ ...form, distanceToCustomerKm: e.target.value })}
              required
            />
          </Field>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="Cold storage"
              checked={form.hasColdStorage}
              onChange={(checked) => setForm({ ...form, hasColdStorage: checked })}
            />
            <Checkbox
              label="Refrigerated fleet"
              checked={form.hasRefrigeratedFleet}
              onChange={(checked) => setForm({ ...form, hasRefrigeratedFleet: checked })}
            />
          </div>
          <FormActions editing={editing !== null} addLabel="Add warehouse" onCancel={close} />
        </form>
      </Dialog>

      <Dialog
        open={selected !== undefined}
        title={selected ? `Stock in ${selected.id} ${selected.city}` : "Stock"}
        onClose={() => setStockFor(null)}
      >
        {selected && (
          <>
            {alerts}
            <WarehouseStock warehouse={selected} products={prods} stock={stock} run={run} />
          </>
        )}
      </Dialog>
    </div>
  );
}
