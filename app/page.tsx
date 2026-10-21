import { redirect } from "next/navigation";

// The order page will live here; until then the app opens on the products page.
export default function Home() {
  redirect("/products");
}
