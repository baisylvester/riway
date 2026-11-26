import { createRoot } from "react-dom/client";
import { ProductAssistant } from "../../src/components/product-assistant";

// Isolated real component mount: no provider configuration, key or server
// feature bypass. Browser tests supply synthetic microphone/fetch behavior.
createRoot(document.getElementById("root")!).render(
  <ProductAssistant voiceEnabled />,
);
