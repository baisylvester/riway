import { SecurityPanel } from "@/components/auth-panel";
export const metadata = { title: "Account security" };
export default function Security() {
  return (
    <div style={{ maxWidth: 600 }}>
      <SecurityPanel />
    </div>
  );
}
