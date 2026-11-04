import "server-only";
import { db } from "./supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asMarket, type Offer, type Product } from "./domain";
export async function currentMarket() {
  return asMarket((await cookies()).get("riway-market")?.value);
}
export async function catalogue() {
  const client = await db();
  const [products, offers] = await Promise.all([
    client.from("products").select("*").eq("status", "published").order("name"),
    client.from("product_offers").select("*"),
  ]);
  if (products.error || offers.error) {
    // Keep the local visual preview usable when Supabase is unavailable. This
    // branch is development-only; production still fails closed so commerce
    // never runs against invented catalogue data.
    if (process.env.NODE_ENV !== "production") return previewCatalogue;
    throw new Error("The catalogue could not be loaded. Please try again.");
  }
  return {
    products: products.data as Product[],
    offers: offers.data as Offer[],
  };
}
export async function content(kind: string) {
  const client = await db();
  const { data, error } = await client
    .from("content_entries")
    .select("*")
    .eq("kind", kind)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) {
    if (process.env.NODE_ENV !== "production") return [];
    throw new Error("Content could not be loaded.");
  }
  return data;
}

const previewCatalogue: { products: Product[]; offers: Offer[] } = {
  products: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "purtier-placenta",
      name: "PURTIER Placenta",
      category: "Nutrition",
      subtitle: "The luxury of health.",
      description: "A considered presentation of the PURTIER Placenta collection.",
      image_url: "/design/purtier-7th.png",
      status: "published",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      slug: "conscientious",
      name: "CONSCIENTIOUS",
      category: "Essence",
      subtitle: "Indulge in the highest level of luxury.",
      description: "Two essences, two rituals, presented by RIWAY.",
      image_url: "/design/conscientious/collection.jpg",
      status: "published",
    },
  ],
  offers: [],
};
export async function session() {
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  return { client, user };
}
export async function requireSession() {
  const current = await session();
  if (!current.user) redirect("/auth/login");
  return { client: current.client, user: current.user };
}
export async function staffAccess() {
  const { client, user } = await session();
  if (!user) return { user: null, allowed: false, mfa: false };
  const [{ data: roles }, { data: aal }] = await Promise.all([
    client.from("staff_roles").select("market,role").eq("user_id", user.id),
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  return { user, allowed: !!roles?.length, mfa: aal?.currentLevel === "aal2" };
}
