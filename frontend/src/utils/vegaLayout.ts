import { useEffect } from "react";
import type { RefObject } from "react";
import type { View } from "vega";

export const APP_LAYOUT_RESIZE_EVENT = "app-layout-resize";

export function requestAppLayoutResize() {
  window.dispatchEvent(new Event(APP_LAYOUT_RESIZE_EVENT));
  window.dispatchEvent(new Event("resize"));
}

export function resizeVegaView(view: View | null) {
  view?.resize().runAsync().catch(() => undefined);
}

export function useVegaLayoutResize(viewRef: RefObject<View | null>) {
  useEffect(() => {
    const handleResize = () => {
      window.requestAnimationFrame(() => resizeVegaView(viewRef.current));
    };

    window.addEventListener(APP_LAYOUT_RESIZE_EVENT, handleResize);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener(APP_LAYOUT_RESIZE_EVENT, handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, [viewRef]);
}
