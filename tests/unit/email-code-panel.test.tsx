import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/auth/email-code-actions", () => ({
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));
import { EmailCodePanel } from "@/components/email-code-panel";

it("allows an already received code to be verified before a new send or after refreshing", () => {
  const html = renderToStaticMarkup(<EmailCodePanel />);
  expect(html).toContain('name="code"');
  expect(html).toContain('autoComplete="one-time-code"');
  expect(html).toContain("Already received a code?");
  expect(html).toContain(">Verify</button>");
});
