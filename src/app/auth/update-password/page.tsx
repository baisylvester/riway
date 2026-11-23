import { AuthPanel } from "@/components/auth-panel";
export default function Update() {
  return (
    <section className="auth-container">
      <h1>Choose a new password.</h1>
      <AuthPanel mode="update" />
    </section>
  );
}
