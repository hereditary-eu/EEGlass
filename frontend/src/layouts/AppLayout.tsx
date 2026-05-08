import { NavLink, Outlet, useLocation } from "react-router-dom";

export function AppLayout() {
  const { pathname } = useLocation();
  const isWorkspaceRoute = pathname.startsWith("/workspace");
  const pageTitle = isWorkspaceRoute
    ? "EEG Workspace"
    : pathname === "/components"
      ? "Retained Components"
      : "Overview";

  return (
    <main className={isWorkspaceRoute ? "app-shell app-shell--tool" : "app-shell"}>
      <div className={isWorkspaceRoute ? "app-layout app-layout--tool" : "app-layout"}>
        <header className="app-header">
          <div>
            <p className="app-eyebrow">All In On EEG</p>
            <h1 className="app-title">{pageTitle}</h1>
          </div>

          <nav className="app-nav" aria-label="Primary">
            <NavLink
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link--active" : "app-nav-link")}
              to="/"
              end
            >
              Overview
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link--active" : "app-nav-link")}
              to="/components"
            >
              Components
            </NavLink>
          </nav>
        </header>

        <Outlet />
      </div>
    </main>
  );
}
