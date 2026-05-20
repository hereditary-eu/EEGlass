import { useEffect } from "react";

import { useAppStore } from "../../stores/useAppStore";

export function useTimeseriesModelInfo() {
  const modelInfo = useAppStore((state) => state.modelInfo);
  const initializeModelState = useAppStore((state) => state.initializeModelState);

  useEffect(() => {
    void initializeModelState();
  }, [initializeModelState]);

  return modelInfo;
}
