import { ReferenceConscientious } from "@/components/brand/reference-products-conscientious";
import {
  productPresentation,
  productPresentationMetadata,
} from "@/lib/product-presentation";

export const generateMetadata = () =>
  productPresentationMetadata("conscientious");

export default async function Page() {
  const presentation = await productPresentation("conscientious");
  return <ReferenceConscientious {...presentation} />;
}
