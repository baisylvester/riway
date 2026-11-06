export function authErrorMessage(error: unknown, mode: string) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "email_not_confirmed")
    return "Confirm your email using the link in your inbox, then sign in.";
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  )
    return "Too many attempts. Please wait a few minutes and try again.";
  if (error instanceof TypeError || code === "request_timeout")
    return "The sign-in service could not be reached. Check your connection and try again.";
  return mode === "login"
    ? "Sign-in failed. Check your email and password, or use Forgot password."
    : "The request could not be completed. Please try again later.";
}
