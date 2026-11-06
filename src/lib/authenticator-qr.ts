// Supabase's SDK returns an SVG data URL, rather than bare SVG markup.
// Encode only the SVG payload so '#' and other URL characters stay in the image.
export function authenticatorQrSource(value: string) {
  const input = value.trim();
  if (/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/i.test(input))
    return input;
  const prefix = input.match(
    /^data:image\/svg\+xml(?:;(?:charset=)?utf-?8)?,/i,
  );
  const payload = prefix ? input.slice(prefix[0].length) : input;
  const svg = payload.trimStart().startsWith("<")
    ? payload
    : decodeURIComponent(payload);
  if (!/^<svg(?:\s|>)/i.test(svg.trimStart()))
    throw new Error("Authenticator QR image is unavailable.");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
