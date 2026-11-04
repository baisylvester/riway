import type { Metadata } from "next";
import { ReferenceConscientious } from "@/components/brand/reference-products-conscientious";

export const metadata: Metadata = {
  title: "CONSCIENTIOUS — for him & for her · RIWAY",
  description:
    "CONSCIENTIOUS, exclusively developed by RIWAY International. Essence sprays and masks for him and for her, with gold and 27 patented ingredients.",
};

export default function Page() {
  return <ReferenceConscientious />;
}
