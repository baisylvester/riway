import type { Metadata } from "next";
import { ReferencePurtier } from "@/components/brand/reference-products-purtier";

export const metadata: Metadata = {
  title: "PURTIER Placenta — 7th Edition · RIWAY",
  description:
    "PURTIER Placenta, the seventh edition. Revolutionary, cutting edge, optimal care. Fourteen ingredients, carefully selected.",
};

export default function Page() {
  return <ReferencePurtier />;
}
