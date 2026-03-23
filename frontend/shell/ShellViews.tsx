import { useState, type ReactNode } from "react";
import type { ToolDefinition } from "../toolRegistry";

interface NavigateProps {
  onNavigate: (route: string) => void;
}

interface ShellLayoutProps extends NavigateProps {
  activeToolId?: string;
  tools: ToolDefinition[];
  workspace?: boolean;
  children: ReactNode;
}

function ShellLayout({ activeToolId, tools, onNavigate, workspace = false, children }: ShellLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (route: string) => {
    setMenuOpen(false);
    onNavigate(route);
  };

  return (
    <div className="shell-page">
      <header className="shell-nav">
        <div className="shell-nav-main">
          <button
            type="button"
            className="shell-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
          >
            <span className="shell-menu-bar" />
            <span className="shell-menu-bar" />
            <span className="shell-menu-bar" />
          </button>

          <div className="shell-brand">
            <span className="shell-brand-kicker">all-in-on-eeg</span>
          </div>
        </div>
      </header>

      <div className={`shell-drawer-backdrop ${menuOpen ? "is-open" : ""}`} onClick={() => setMenuOpen(false)} />

      <aside className={`shell-drawer ${menuOpen ? "is-open" : ""}`} aria-label="Tool navigation">
        <div className="shell-drawer-header">
          <span className="shell-drawer-title">Navigation</span>
        </div>

        <nav className="shell-drawer-links">
          <button type="button" className="shell-drawer-link" onClick={() => handleNavigate("/")}>
            Home
          </button>
          {tools.map(tool => (
            <button
              key={tool.id}
              type="button"
              className={`shell-drawer-link ${tool.id === activeToolId ? "is-active" : ""}`}
              onClick={() => handleNavigate(tool.route)}
            >
              {tool.title}
            </button>
          ))}
        </nav>
      </aside>

      <main className={workspace ? "shell-workspace" : "shell-landing"}>{children}</main>
    </div>
  );
}

interface ShellFrameProps extends NavigateProps {
  activeToolId: string;
  tools: ToolDefinition[];
  children: ReactNode;
}

export function ShellFrame({ activeToolId, tools, onNavigate, children }: ShellFrameProps) {
  return (
    <ShellLayout activeToolId={activeToolId} tools={tools} onNavigate={onNavigate} workspace>
      <section className="shell-tool-surface">{children}</section>
    </ShellLayout>
  );
}

interface ToolboxLandingProps extends NavigateProps {
  tools: ToolDefinition[];
}

export function ToolboxLanding({ tools, onNavigate }: ToolboxLandingProps) {
  return (
    <ShellLayout tools={tools} onNavigate={onNavigate}>
      <h1 className="shell-landing-title">Tools</h1>

      <div className="shell-card-grid">
        {tools.map(tool => (
          <article key={tool.id} className="shell-card">
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <div>
              <button type="button" className="shell-card-button" onClick={() => onNavigate(tool.route)}>
                Open
              </button>
            </div>
          </article>
        ))}
      </div>
    </ShellLayout>
  );
}

interface NotFoundViewProps extends NavigateProps {
  tools: ToolDefinition[];
}

export function NotFoundView({ onNavigate, tools }: NotFoundViewProps) {
  return (
    <ShellLayout tools={tools} onNavigate={onNavigate} workspace>
      <div className="shell-not-found">
        <h1>Route not found</h1>
        <p>The requested route does not exist.</p>
        <button type="button" className="shell-card-button" onClick={() => onNavigate("/")}>
          Return home
        </button>
      </div>
    </ShellLayout>
  );
}

interface ToolIframeProps {
  src: string;
  title: string;
}

export function ToolIframe({ src, title }: ToolIframeProps) {
  return (
    <div className="shell-iframe-container">
      <iframe className="shell-tool-iframe" src={src} title={title} loading="eager" />
    </div>
  );
}
