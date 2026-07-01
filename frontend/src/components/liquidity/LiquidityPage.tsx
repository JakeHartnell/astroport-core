import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";

export function LiquidityPage() {
  return (
    <section className="panel-page">
      <p className="eyebrow">Liquidity</p>
      <h2>Wallet LP overview</h2>
      <p>V1 does not assume an indexer, so this page does not pretend unknown positions are zero. Connected wallet support can query known LP denoms from the strict registry; until then, choose a verified pool to inspect reserves and add/remove flows.</p>
      <p className="empty-state">No wallet connected: LP balances are unknown, not empty.</p>
      <div className="pool-table">
        {enabledPools.map((pool) => <Link className="liquidity-row" to={`/pools/${pool.pair}`} key={pool.id}><strong>{pool.label}</strong><span>{pool.assets.map((asset) => asset.symbol).join(" / ")}</span><code>{pool.lpToken}</code></Link>)}
      </div>
    </section>
  );
}
