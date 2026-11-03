import { AuthForm } from "@/components/auth-form";
export default function Login() {
  return (
    <section className="auth-container">
      <span className="eyebrow">YOUR RIWAY ACCOUNT</span>
      <h1>Welcome back.</h1>
      <p className="muted">Sign in to continue your journey.</p>
      <AuthForm />
    </section>
  );
}
