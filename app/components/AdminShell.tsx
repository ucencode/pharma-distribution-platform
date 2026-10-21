"use client";

import { ClipboardList, Menu, Pill, Tags, Warehouse } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { button } from "./styles";

const links = [
  { href: "/", label: "Order", icon: ClipboardList },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/products", label: "Products", icon: Pill },
  { href: "/warehouses", label: "Warehouses", icon: Warehouse },
];

// Top bar, sidebar and work area. Below `md` the sidebar opens from the Menu button.
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          className={`${button} md:hidden`}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu className="size-4" aria-hidden="true" />
          Menu
        </button>
        <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-100">
          Pharma Distribution
        </Link>
      </header>

      <div className="flex flex-1">
        {menuOpen && (
          <div
            className="fixed inset-0 top-14 z-10 bg-black/30 md:hidden"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <nav
          id="sidebar"
          aria-label="Main"
          className={`${menuOpen ? "fixed" : "hidden"} top-14 bottom-0 left-0 z-20 w-56 shrink-0 border-r border-zinc-200 bg-white p-3 md:static md:block dark:border-zinc-800 dark:bg-zinc-900`}
        >
          <ul className="flex flex-col gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
                      active
                        ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 bg-zinc-50 p-4 md:p-6 dark:bg-zinc-950">{children}</main>
      </div>
    </div>
  );
}
