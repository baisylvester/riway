import { AuthForm } from "@/components/auth-form";
export default function Update() {
  return (
    <section className="auth-container">
      <h1>Choose a new password.</h1>
      <AuthForm mode="update" />
    </section>
  );
}
