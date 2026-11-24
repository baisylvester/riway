// NEXT_PUBLIC values are frozen by Next.js during the build. A deployment can
// promote the same artifact to another host by setting this server-only value.
export function configuredSiteUrl(
  env: Record<string, string | undefined> = process.env,
) {
  return env.SITE_URL || env.NEXT_PUBLIC_SITE_URL;
}
