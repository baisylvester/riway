import type { AnchorHTMLAttributes } from "react";
export default function HarnessLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
}
