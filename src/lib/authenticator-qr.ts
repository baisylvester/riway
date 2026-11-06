import { create } from "qrcode";

// Render modules directly, avoiding SVG data-URL image decoding entirely.
export function authenticatorQr(uri: string) {
  const url = new URL(uri);
  const secret = url.searchParams.get("secret") ?? "";
  if (
    url.protocol !== "otpauth:" ||
    url.hostname !== "totp" ||
    !/^[A-Z2-7]+=*$/i.test(secret)
  )
    throw new Error("Authenticator enrollment is unavailable.");
  const { modules } = create(uri, { errorCorrectionLevel: "M" });
  const paths: string[] = [];
  const quietZone = 4;
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x))
        paths.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
  return { size: modules.size + quietZone * 2, path: paths.join(""), secret };
}
