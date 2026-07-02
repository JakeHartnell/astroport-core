import { useDexRegistry } from "../../queries/useDexRegistry";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools, discovery } = useDexRegistry();
  return (
    <section className="panel-page">
      <p className="eyebrow">Factory pools</p>
      <h2>Discovered Astroport-Juno pools</h2>
      <p>Factory discovery refreshes in the background and overlays curated registry labels, verification, and featured metadata. Unknown pools are listed as unverified and experimental.</p>
      {discovery.isError ? <p className="error-text">Factory discovery failed; showing curated registry fallback only.</p> : null}
      {discovery.isFetching ? <p>Refreshing factory pairs…</p> : null}
      <PoolTable pools={pools} />
    </section>
  );
}
