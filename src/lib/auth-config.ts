export function authProvider() {
  const provider = process.env.AUTH_PROVIDER || "supabase";
  if (provider !== "supabase" && provider !== "clerk")
    throw new Error("Unsupported authentication provider");
  return provider;
}

export function secondFactorVerified(
  claims: { fva?: unknown } | null | undefined,
) {
  const age = claims?.fva;
  return (
    Array.isArray(age) &&
    Number.isInteger(age[1]) &&
    age[1] >= 0 &&
    age[1] <= 15
  );
}
