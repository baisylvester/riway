import { SecurityPanel } from "@/components/auth-panel";
import Link from "@/components/localized-link";
import { authProvider } from "@/lib/auth-config";
export const metadata = { title: "Account security" };
export default function Security() {
  return (
    <div style={{ maxWidth: 600 }}>
      {authProvider() === "supabase" && (
        <p>
          <Link href="/auth/update-password">
            Choose or change your account password
          </Link>
          . Your verified email and existing orders remain linked to the same
          secure account.
        </p>
      )}
      <SecurityPanel />
    </div>
  );
}
