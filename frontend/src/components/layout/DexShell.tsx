import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import junoLogo from "../../assets/juno-logo-salmon.svg";
import junoWordmark from "../../assets/juno-wordmark-salmon.svg";
import { navigationItems } from "../../app/routes";
import { WalletProvider } from "../../wallet/WalletContext";
import { NetworkGuardBanner } from "../wallet/NetworkGuardBanner";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { SlippageSettingsProvider } from "../../settings/SlippageSettingsContext";

export function DexShell({ children }: { children: ReactNode }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const location = useLocation();
  const currentRoute = navigationItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  const pageTitle = currentRoute?.label ?? "Swap";

  return (
    <WalletProvider>
      <SlippageSettingsProvider>
      <div className="dex-shell">
        <header className="app-header">
          <div className="header-inner">
            <NavLink className="brand-lockup" to="/swap" aria-label="Juno DEX home">
              <img className="brand-logo" src={junoLogo} alt="" aria-hidden="true" />
              <span className="brand-copy">
                <h1 className="brand-title">
                  <img src={junoWordmark} alt="Juno" />
                  <span>DEX</span>
                </h1>
              </span>
            </NavLink>
          </div>

          <nav id="primary-navigation" className={`primary-nav ${isNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                onClick={() => setIsNavOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-network">
            <span className="eyebrow">Network</span>
            <div><span>Chain</span><strong>Juno</strong></div>
            <div><span>Mode</span><strong>Swap</strong></div>
            <div><span>Phase</span><strong>Live</strong></div>
          </div>
        </header>

        <div className="app-topbar">
          <span className="eyebrow topbar-coord">{pageTitle}</span>
          <div className="topbar-actions">
            <WalletConnectButton />
            <button
              className="mobile-nav-toggle"
              type="button"
              aria-controls="primary-navigation"
              aria-expanded={isNavOpen}
              onClick={() => setIsNavOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
        </div>

        <NetworkGuardBanner />

        <main className="app-main" tabIndex={-1}>{children}</main>
      </div>
      </SlippageSettingsProvider>
    </WalletProvider>
  );
}
