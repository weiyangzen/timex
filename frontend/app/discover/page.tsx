import { RuleBadges } from "../../components/ui";
import { DiscoverClient } from "./discover-client";

export default function DiscoverPage() {
  return (
    <div className="modulePage discoverPage">
      <header className="moduleHeader discoverHeader">
        <div>
          <span className="eyebrow">Market entry</span>
          <h1>Discover</h1>
        </div>
        <RuleBadges />
      </header>

      <DiscoverClient />
    </div>
  );
}
