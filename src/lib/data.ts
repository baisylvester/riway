import "server-only";
import { db } from "./supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asMarket, type Offer, type Product } from "./domain";
import { auth, currentUser } from "@clerk/nextjs/server";
import { authProvider, secondFactorVerified } from "./auth-config";
import { cache } from "react";
import { packageCompositionsSchema } from "./commerce-checkout";
import { recommendationRowSchema } from "./recommendations";
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

export async function packageCompositions(market: import("./domain").Market) {
  const { data, error } = await (
    await db()
  ).rpc("catalogue_package_compositions", { m: market });
  const parsed = packageCompositionsSchema.safeParse(data);
  if (error || !parsed.success)
    throw new Error(
      "Package information could not be loaded. Please try again.",
    );
  return parsed.data;
}

export async function packageComposition(
  productId: string,
  market: import("./domain").Market,
) {
  return (await packageCompositions(market)).find(
    (item) => item.productId === productId,
  );
}

// Staff-curated cross-sell rows. Optional page content: any failure (including
// a database without the table yet) returns no suggestions.
export async function productRecommendations(productId: string) {
  try {
    const { data, error } = await (
      await db()
    )
      .from("product_recommendations")
      .select("product_id,recommended_id,position")
      .eq("product_id", productId)
      .order("position")
      .limit(4);
    const parsed = recommendationRowSchema.array().safeParse(data);
    return error || !parsed.success ? [] : parsed.data;
  } catch {
    return [];
  }
}

const previewCatalogue: { products: Product[]; offers: Offer[] } = {
  products: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "purtier-placenta",
      name: "PURTIER Placenta",
      category: "Nutrition",
      subtitle: "The luxury of health.",
      description:
        "A considered presentation of the PURTIER Placenta collection.",
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
export const session = cache(async () => {
  const client = await db();
  if (authProvider() === "clerk") {
    const identity = await auth();
    if (!identity.userId) return { client, user: null };
    const { data: id, error } = await client.rpc("ensure_clerk_profile");
    if (error || typeof id !== "string")
      throw new Error("Account synchronization is unavailable.");
    const user = await currentUser();
    const primary = user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );
    return {
      client,
      user: {
        id,
        email:
          primary?.verification?.status === "verified"
            ? primary.emailAddress
            : undefined,
      },
    };
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  return { client, user };
});
export async function requireSession() {
  const current = await session();
  if (!current.user) redirect("/auth/login");
  return { client: current.client, user: current.user };
}
export async function staffAccess() {
  const { client, user } = await session();
  if (!user) return { user: null, allowed: false, mfa: false };
  if (authProvider() === "clerk") {
    const [{ data: roles }, identity] = await Promise.all([
      client.from("staff_roles").select("market,role").eq("user_id", user.id),
      auth(),
    ]);
    return {
      user,
      allowed: !!roles?.length,
      mfa: secondFactorVerified(identity.sessionClaims),
    };
  }
  // Authenticator (aal2) or a recent email code for this session; the same
  // rule the database applies in private.mfa_verified().
  const [{ data: roles }, { data: verified }] = await Promise.all([
    client.from("staff_roles").select("market,role").eq("user_id", user.id),
    client.rpc("second_factor_verified"),
  ]);
  return { user, allowed: !!roles?.length, mfa: verified === true };
}
