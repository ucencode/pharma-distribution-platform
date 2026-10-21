"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { button, danger, dangerOutline } from "./styles";

// Edit and Delete for a table row. Delete asks for a second click before it runs.
// `children` holds extra buttons shown before Edit.
export default function RowActions({
  onEdit,
  onDelete,
  children,
}: {
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={danger}
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Confirm delete
        </button>
        <button type="button" className={button} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      {children}
      <button type="button" className={button} onClick={onEdit}>
        <Pencil className="size-4" aria-hidden="true" />
        Edit
      </button>
      <button type="button" className={dangerOutline} onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </button>
    </div>
  );
}
