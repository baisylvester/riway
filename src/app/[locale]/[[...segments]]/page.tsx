import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import type { Metadata } from "next";
import { localizedRoute } from "@/lib/locale-routes";
import { enabledLocales } from "@/lib/locales";
import { currentMarket } from "@/lib/data";
type Props = {
  params: Promise<{ locale: string; segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
type PageProps = {
  params: Promise<Record<string, string>>;
  searchParams: Props["searchParams"];
};
async function resolve(props: Props) {
  const { locale, segments } = await props.params;
  const route = localizedRoute(locale, segments);
  if (!route || !enabledLocales(await currentMarket()).includes(route.locale))
    notFound();
  return route;
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const route = await resolve(props);
  const module = (await route.load()) as {
    metadata?: Metadata;
    generateMetadata?: (props: PageProps) => Promise<Metadata>;
  };
  return module.generateMetadata
    ? module.generateMetadata({
        params: Promise.resolve(route.params),
        searchParams: props.searchParams,
      })
    : (module.metadata ?? {});
}
export default async function LocalizedPage(props: Props) {
  const route = await resolve(props);
  const { default: Page } = (await route.load()) as {
    default: ComponentType<PageProps>;
  };
  const content = (
    <Page
      params={Promise.resolve(route.params)}
      searchParams={props.searchParams}
    />
  );
  if (route.account) {
    const { default: AccountLayout } = await import("@/app/account/layout");
    return <AccountLayout>{content}</AccountLayout>;
  }
  return content;
}
