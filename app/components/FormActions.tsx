import { Check, Plus } from "lucide-react";
import { button, primary } from "./styles";

// Footer buttons of a form dialog: Cancel, then the submit button.
export default function FormActions({
  editing,
  addLabel,
  onCancel,
}: {
  editing: boolean;
  addLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={button} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={primary}>
        {editing ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {editing ? "Save changes" : addLabel}
      </button>
    </div>
  );
}
