"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { categories } from "@/lib/db/schema";
import { api } from "./api";
import Alert from "./Alert";
import Dialog from "./Dialog";
import Field from "./Field";
import FormActions from "./FormActions";
import ListState from "./ListState";
import PageHeader from "./PageHeader";
import RowActions from "./RowActions";
import { input, primary, table, tableWrap, td, th, tr } from "./styles";

type Category = typeof categories.$inferSelect;

const blank = { name: "" };

export default function CategoriesManager() {
  const [rows, setRows] = useState<Category[] | null>(null);
  const [form, setForm] = useState(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api<Category[]>("/api/categories")
      .then(setRows)
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
      () =>
        editing
          ? api<Category>(`/api/categories/${encodeURIComponent(editing)}`, "PATCH", form)
          : api<Category>("/api/categories", "POST", form),
      (row) => `Saved category ${row.id}.`,
    );
    if (ok) close();
  }

  function openAdd() {
    setEditing(null);
    setForm(blank);
    setError("");
    setFormOpen(true);
  }

  function edit(row: Category) {
    setEditing(row.id);
    setForm({ name: row.name });
    setError("");
    setFormOpen(true);
  }

  function close() {
    setFormOpen(false);
    setEditing(null);
    setForm(blank);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Categories">
        <button type="button" className={primary} onClick={openAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add category
        </button>
      </PageHeader>

      {!formOpen && (
        <>
          <Alert variant="error" message={error} />
          <Alert variant="success" message={notice} />
        </>
      )}

      <ListState rows={rows} noun="categories">
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Name</th>
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
                  <td className={td}>
                    <RowActions
                      onEdit={() => edit(row)}
                      onDelete={() =>
                        run(
                          () => api(`/api/categories/${encodeURIComponent(row.id)}`, "DELETE"),
                          () => `Deleted category ${row.id}.`,
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
        title={editing ? `Edit category ${editing}` : "Add category"}
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
          <FormActions editing={editing !== null} addLabel="Add category" onCancel={close} />
        </form>
      </Dialog>
    </div>
  );
}
