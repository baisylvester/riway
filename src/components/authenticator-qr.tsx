import type { authenticatorQr } from "@/lib/authenticator-qr";

export function AuthenticatorQr({
  qr,
}: {
  qr: ReturnType<typeof authenticatorQr>;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="mfa-qr"
      width="220"
      height="220"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label="Scan to enroll your RIWAY authenticator"
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
