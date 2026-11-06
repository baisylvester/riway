import { describe, expect, it } from "vitest";
import { authErrorMessage } from "../../src/lib/auth-feedback";
describe("authentication failure feedback", () => {
  it("distinguishes an unverified email from an invalid password", () => {
    expect(
      authErrorMessage({ code: "email_not_confirmed" }, "login"),
    ).toContain("Confirm your email");
    expect(
      authErrorMessage({ code: "invalid_credentials" }, "login"),
    ).toContain("Forgot password");
  });
  it("does not blame credentials for unavailable transport or rate limiting", () => {
    expect(authErrorMessage(new TypeError("fetch failed"), "login")).toContain(
      "could not be reached",
    );
    expect(
      authErrorMessage({ code: "over_request_rate_limit" }, "login"),
    ).toContain("Too many attempts");
  });
  it("does not echo raw provider errors or account data", () => {
    const message = authErrorMessage(
      { message: "internal secret and account details" },
      "login",
    );
    expect(message).not.toContain("internal secret");
    expect(authErrorMessage({}, "register")).toContain(
      "could not be completed",
    );
  });
});
