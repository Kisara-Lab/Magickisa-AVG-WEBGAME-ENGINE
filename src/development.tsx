import { describeError } from "./engine/errors";
import { requireModernProfile, LEGACY_RELEASE_URL } from "./engine/support";
import { createRoot } from "react-dom/client";
import { GenericAvgApp } from "./engine/GenericAvgApp";
let unsupported = "";
try {
  requireModernProfile(new URLSearchParams(location.search).get("profile"));
} catch (error) {
  unsupported = describeError(error).replace(LEGACY_RELEASE_URL, "");
}
createRoot(document.getElementById("root")!).render(
  unsupported ? (
    <main role="alert">
      <h1>无法打开此运行模式</h1>
      <p>{unsupported}</p>
      <a href={LEGACY_RELEASE_URL}>v1.0legacy</a>
    </main>
  ) : (
    <GenericAvgApp />
  ),
);
