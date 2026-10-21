const variants = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  lightBlue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function Badge({
  variant,
  className = "",
  title,
  children,
}: {
  variant: keyof typeof variants;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex cursor-default items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
