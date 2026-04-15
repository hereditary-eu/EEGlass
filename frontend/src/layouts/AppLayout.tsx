import { NavLink, Outlet, useLocation } from "react-router-dom";

export function AppLayout() {
  const { pathname } = useLocation();
  const isMainRoute = pathname === "/";

  return (
    <main className={isMainRoute ? "app-shell app-shell--tool" : "app-shell"}>
      <div className={isMainRoute ? "app-layout app-layout--tool" : "app-layout"}>
        <header className="app-header">
          <div>
            <p className="app-eyebrow">All In On EEG</p>
            <h1 className="app-title">{isMainRoute ? "Main Tool" : "Retained Components"}</h1>
          </div>

          <nav className="app-nav" aria-label="Primary">
            <NavLink
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link--active" : "app-nav-link")}
              to="/"
              end
            >
              Main
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
