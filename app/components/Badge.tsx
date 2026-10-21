const variants = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  lightBlue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
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
