// Page title on the left, page actions (such as the Add button) on the right.
export default function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
      {children}
    </div>
  );
}
