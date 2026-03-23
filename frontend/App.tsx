import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { NotFoundView, ShellFrame, ToolIframe, ToolboxLanding } from "./shell/ShellViews";
import { TOOL_REGISTRY } from "./toolRegistry";

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname || "/";
}

function usePathname() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return pathname;
}

function navigate(pathname: string) {
  const nextPath = normalizePath(pathname);
  if (nextPath === normalizePath(window.location.pathname)) {
    return;
  }

  window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const pathname = usePathname();
  const activeTool = useMemo(
    () => TOOL_REGISTRY.find(tool => tool.route === pathname),
    [pathname],
  );

  if (pathname === "/") {
    return <ToolboxLanding tools={TOOL_REGISTRY} onNavigate={navigate} />;
  }

  if (!activeTool) {
    return <NotFoundView tools={TOOL_REGISTRY} onNavigate={navigate} />;
  }

  return (
    <ShellFrame activeToolId={activeTool.id} tools={TOOL_REGISTRY} onNavigate={navigate}>
      <ErrorBoundary key={activeTool.id}>
        <ToolIframe key={activeTool.id} title={activeTool.title} src={activeTool.appUrl} />
      </ErrorBoundary>
    </ShellFrame>
  );
}

export default App;
