import { AuthPanel } from "@/components/auth-panel";
import { session } from "@/lib/data";
import { redirect } from "next/navigation";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user } = await session();
  if (user) redirect("/account");
  const params = await searchParams;
  return (
    <section className="auth-container">
      <span className="eyebrow">YOUR RIWAY ACCOUNT</span>
      <h1>Welcome back.</h1>
      <p className="muted">Sign in to continue your journey.</p>
      {params.error === "confirmation" && (
        <p className="notice" role="alert">
          The confirmation or password-reset link could not be verified. Request
          a new link and open it in the same browser.
        </p>
      )}
      <AuthPanel />
    </section>
  );
}
