const variants = {
  error: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  success: "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
};

export default function Alert({
  variant,
  message,
}: {
  variant: keyof typeof variants;
  message: string;
}) {
  if (!message) return null;
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={`rounded border px-3 py-2 text-sm ${variants[variant]}`}
    >
      {message}
    </p>
  );
}
