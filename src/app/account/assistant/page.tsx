import { requireSession } from "@/lib/data";
import { ProductAssistant } from "@/components/product-assistant";
import { assistantConfiguration } from "@/services/approved-content-assistant";
export const metadata = { title: "Product assistant" };
export default async function Assistant() {
  await requireSession();
  const config = assistantConfiguration();
  return (
    <div className="stack">
      <h2>Product and order assistant</h2>
      {!config.enabled && (
        <p className="notice">
          AI product answers are awaiting provider configuration and approved
          reference content. Your signed-in order lookup and RIWAY support
          remain available.
        </p>
      )}
      <ProductAssistant voiceEnabled={config.voice} />
    </div>
  );
}
