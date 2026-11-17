import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
