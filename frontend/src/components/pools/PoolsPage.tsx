import { useDexRegistry } from "../../queries/useDexRegistry";
import { ErrorState, Skeleton } from "../common";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools, discovery } = useDexRegistry();
  return (
    <section className="panel-page">
      <p className="eyebrow">Factory pools</p>
      <h2>Discovered Astroport-Juno pools</h2>
      <p>Factory discovery refreshes in the background and overlays curated registry labels, verification, and featured metadata. Unknown pools are listed as unverified and experimental.</p>
      {discovery.isError ? <ErrorState title="Factory discovery unavailable" error="Showing curated registry fallback only; no fake factory rows are injected." onRetry={() => void discovery.refetch()} /> : null}
      {discovery.isFetching ? <div className="lp-position-skeleton" aria-label="Refreshing factory pairs"><Skeleton width="14rem" /><Skeleton width="22rem" /></div> : null}
      <PoolTable pools={pools} />
    </section>
  );
}
