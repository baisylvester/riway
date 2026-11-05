import { AuthPanel } from "@/components/auth-panel";
export default function Register() {
  return (
    <section className="auth-container">
      <span className="eyebrow">BEGIN YOUR JOURNEY</span>
      <h1>A new connection.</h1>
      <p className="muted">
        Create your website account. Existing RIWAY membership will require
        verification.
      </p>
      <AuthPanel mode="register" />
    </section>
  );
}
