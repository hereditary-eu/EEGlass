import { useEffect, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type { ModelInfoResponse } from "../../types";

export function useTimeseriesModelInfo() {
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);

  useEffect(() => {
    let isCurrent = true;

    TimeseriesService.getModelInfo()
      .then((nextModelInfo) => {
        if (isCurrent) {
          setModelInfo(nextModelInfo);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setModelInfo(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return modelInfo;
}
