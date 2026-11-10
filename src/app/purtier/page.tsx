import { ReferencePurtier } from "@/components/brand/reference-products-purtier";
import {
  productPresentation,
  productPresentationMetadata,
} from "@/lib/product-presentation";

export const generateMetadata = () =>
  productPresentationMetadata("purtier-placenta");

export default async function Page() {
  const presentation = await productPresentation("purtier-placenta");
  return <ReferencePurtier {...presentation} />;
}
