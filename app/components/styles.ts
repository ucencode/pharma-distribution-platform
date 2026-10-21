const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

export const input = `w-full rounded border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${focus}`;
// Buttons hold an optional icon before the label.
const base = `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${focus}`;
export const button = `${base} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;
export const primary = `${base} bg-teal-700 text-white hover:bg-teal-800`;
export const danger = `${base} bg-red-700 text-white hover:bg-red-800`;
// Outlined red button for actions that remove data (Delete, Remove).
export const dangerOutline = `${base} border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950`;
export const tableWrap = "overflow-x-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
export const table = "w-full min-w-max border-collapse text-sm text-zinc-900 dark:text-zinc-100";
export const th = "border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300";
export const tr = "hover:bg-zinc-50 dark:hover:bg-zinc-800/40";
export const td = "border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800";
export const muted = "text-sm text-zinc-600 dark:text-zinc-400";
