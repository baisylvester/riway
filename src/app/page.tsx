import { ReferenceHome } from "@/components/brand/reference-home";
import { content, currentMarket } from "@/lib/data";
export const metadata = {
  title: { absolute: "RIWAY International — Showing you the Right Way" },
};
export default async function Home() {
  const [result, market] = await Promise.all([
    content("event")
      .then((events) => ({ events, unavailable: false }))
      .catch(() => ({ events: [], unavailable: true })),
    currentMarket(),
  ]);
  return (
    <ReferenceHome
      events={result.events}
      market={market}
      eventsUnavailable={result.unavailable}
    />
  );
}
