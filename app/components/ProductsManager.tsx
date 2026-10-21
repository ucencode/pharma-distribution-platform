"use client";

import { Plus, Snowflake } from "lucide-react";
import { useEffect, useState } from "react";
import type { categories, products } from "@/lib/db/schema";
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
import { input, primary, table, tableWrap, td, th, tr } from "./styles";

type Category = typeof categories.$inferSelect;
type Product = typeof products.$inferSelect;

// Select value that reveals the new-category fields.
const NEW_CATEGORY = "__new__";

const blank = { name: "", categoryId: "", requiresColdChain: false };
const blankCategory = { name: "" };

export default function ProductsManager() {
  const [rows, setRows] = useState<Product[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState(blank);
  const [newCategory, setNewCategory] = useState(blankCategory);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    Promise.all([api<Product[]>("/api/products"), api<Category[]>("/api/categories")])
      .then(([p, c]) => {
        setRows(p);
        setCats(c);
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
    const ok = await run(
      async () => {
        let categoryId = form.categoryId;
        if (categoryId === NEW_CATEGORY) {
          const created = await api<Category>("/api/categories", "POST", newCategory);
          categoryId = created.id;
        }
        const fields = { ...form, categoryId };
        return editing
          ? api<Product>(`/api/products/${encodeURIComponent(editing)}`, "PATCH", fields)
          : api<Product>("/api/products", "POST", fields);
      },
      (row) => `Saved product ${row.id}.`,
    );
    if (ok) close();
  }

  function openAdd() {
    setEditing(null);
    setForm(blank);
    setNewCategory(blankCategory);
    setError("");
    setFormOpen(true);
  }

  function edit(row: Product) {
    setEditing(row.id);
    setForm({
      name: row.name,
      categoryId: row.categoryId,
      requiresColdChain: row.requiresColdChain,
    });
    setNewCategory(blankCategory);
    setError("");
    setFormOpen(true);
  }

  function close() {
    setFormOpen(false);
    setEditing(null);
    setForm(blank);
    setNewCategory(blankCategory);
  }

  const categoryName = (id: string) => cats.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Products">
        <button type="button" className={primary} onClick={openAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add product
        </button>
      </PageHeader>

      {!formOpen && (
        <>
          <Alert variant="error" message={error} />
          <Alert variant="success" message={notice} />
        </>
      )}

      <ListState rows={rows} noun="products">
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Name</th>
                <th className={th}>Category</th>
                <th className={th}>
                  <span className="sr-only">Handling</span>
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
                  <td className={td}>{row.name}</td>
                  <td className={td}>{categoryName(row.categoryId)}</td>
                  <td className={td}>
                    {row.requiresColdChain && (
                      <Badge variant="lightBlue" title="Cold chain required: store and ship refrigerated">
                        <Snowflake className="size-3.5" aria-hidden="true" />
                        <span className="font-bold" aria-hidden="true">
                          !
                        </span>
                        Cold Chain
                      </Badge>
                    )}
                  </td>
                  <td className={td}>
                    <RowActions
                      onEdit={() => edit(row)}
                      onDelete={() =>
                        run(
                          () => api(`/api/products/${encodeURIComponent(row.id)}`, "DELETE"),
                          () => `Deleted product ${row.id}.`,
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>

      <Dialog
        open={formOpen}
        title={editing ? `Edit product ${editing}` : "Add product"}
        onClose={close}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Alert variant="error" message={error} />
          <Field label="Name">
            <input
              className={input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Category">
            <select
              className={input}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="" disabled>
                Select a category
              </option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
              <option value={NEW_CATEGORY}>New category…</option>
            </select>
          </Field>
          {form.categoryId === NEW_CATEGORY && (
            <Field label="New category name">
              <input
                className={input}
                value={newCategory.name}
                onChange={(e) => setNewCategory({ name: e.target.value })}
                required
              />
            </Field>
          )}
          <Checkbox
            label="Requires cold chain"
            checked={form.requiresColdChain}
            onChange={(checked) => setForm({ ...form, requiresColdChain: checked })}
          />
          <FormActions editing={editing !== null} addLabel="Add product" onCancel={close} />
        </form>
      </Dialog>
    </div>
  );
}
