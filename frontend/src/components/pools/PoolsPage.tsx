import { Link } from "react-router-dom";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { ErrorState, Skeleton } from "../common";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools, discovery } = useDexRegistry();
  return (
    <section className="panel-page pools-page">
      <header className="pools-page-header">
        <p className="eyebrow pools-nodes-eyebrow">Liquidity nodes · {pools.length}</p>
        <Link className="pools-provide-link" to="/create">
          <span aria-hidden="true">+</span> Provide
        </Link>
      </header>
      {discovery.isError ? <ErrorState title="Factory discovery unavailable" error="Showing curated registry fallback only; no fake factory rows are injected." onRetry={() => void discovery.refetch()} /> : null}
      {discovery.isFetching ? <div className="lp-position-skeleton" aria-label="Refreshing factory pairs"><Skeleton width="14rem" /><Skeleton width="22rem" /></div> : null}
      <PoolTable pools={pools} />
    </section>
  );
}
