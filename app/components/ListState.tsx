import { muted } from "./styles";

// Shows the loading or empty message, or the list once there are rows.
export default function ListState({
  rows,
  noun,
  children,
}: {
  rows: unknown[] | null;
  noun: string;
  children: React.ReactNode;
}) {
  if (rows === null) return <p className={muted}>Loading {noun}…</p>;
  if (rows.length === 0) return <p className={muted}>No {noun} yet. Add one with the button above.</p>;
  return children;
}
