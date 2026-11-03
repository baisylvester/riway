import { AuthForm } from "@/components/auth-form";
export default function Reset() {
  return (
    <section className="auth-container">
      <h1>Reset your password.</h1>
      <AuthForm mode="reset" />
    </section>
  );
}
