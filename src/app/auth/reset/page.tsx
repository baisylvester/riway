import { AuthPanel } from "@/components/auth-panel";
export const metadata = { title: "Reset your password" };
export default function Reset() {
  return (
    <section className="auth-container">
      <h1>Reset your password.</h1>
      <AuthPanel mode="reset" />
    </section>
  );
}
