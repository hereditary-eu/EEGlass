import { useEffect, useMemo, useState } from "react";

import { TimeseriesService } from "../../services/TimeseriesService";
import type { TimeseriesDatasetInfo, TimeseriesSource, TimeseriesSubjectInfo } from "../../types";
import { DEFAULT_SOURCE, getErrorMessage, orderSources, resolveSource } from "./shared";

interface UseTimeseriesSubjectSourceOptions {
  routeDatasetId: string;
  routeSubjectId: string;
  source: TimeseriesSource;
  setSelectedTimeseriesSource: (source: TimeseriesSource) => void;
  onRouteChange: () => void;
  onSubjectReset: () => void;
}

export function useTimeseriesSubjectSource({
  routeDatasetId,
  routeSubjectId,
  source,
  setSelectedTimeseriesSource,
  onRouteChange,
  onSubjectReset,
}: UseTimeseriesSubjectSourceOptions) {
  const [datasets, setDatasets] = useState<TimeseriesDatasetInfo[]>([]);
  const [subjects, setSubjects] = useState<TimeseriesSubjectInfo[]>([]);
  const [datasetId, setDatasetId] = useState(routeDatasetId);
  const [subjectId, setSubjectId] = useState(routeSubjectId);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatasetId(routeDatasetId);
    setSubjectId(routeSubjectId);
    setSubjects([]);
    setSelectedTimeseriesSource(DEFAULT_SOURCE);
    onRouteChange();
  }, [onRouteChange, routeDatasetId, routeSubjectId, setSelectedTimeseriesSource]);

  const selectedSubject = useMemo(() => subjects.find((subject) => subject.id === subjectId), [subjectId, subjects]);
  const isSelectedSubjectReady = useMemo(
    () => Boolean(selectedSubject && selectedSubject.sources.includes(source)),
    [selectedSubject, source],
  );

  const sourceOptions = useMemo<TimeseriesSource[]>(() => {
    return selectedSubject?.sources.length ? orderSources(selectedSubject.sources) : ["derivatives", "raw"];
  }, [selectedSubject]);

  useEffect(() => {
    let isCurrent = true;

    async function loadDatasets() {
      setIsLoadingDatasets(true);
      setError(null);

      try {
        const nextDatasets = await TimeseriesService.getDatasets();
        if (!isCurrent) {
          return;
        }

        setDatasets(nextDatasets);
        if (!nextDatasets.some((dataset) => dataset.id === routeDatasetId)) {
          setError(`Dataset ${routeDatasetId} was not found.`);
          setDatasetId("");
          setSubjectId("");
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDatasets(false);
        }
      }
    }

    loadDatasets();

    return () => {
      isCurrent = false;
    };
  }, [routeDatasetId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadSubjects() {
      if (isLoadingDatasets) {
        setIsLoadingSubjects(false);
        return;
      }

      if (!datasetId) {
        setSubjects([]);
        setSubjectId("");
        setIsLoadingSubjects(false);
        return;
      }

      if (datasets.length > 0 && !datasets.some((dataset) => dataset.id === datasetId)) {
        setSubjects([]);
        setSubjectId("");
        setIsLoadingSubjects(false);
        return;
      }

      setIsLoadingSubjects(true);
      setError(null);
      onSubjectReset();

      try {
        const nextSubjects = await TimeseriesService.getSubjects(datasetId);
        if (!isCurrent) {
          return;
        }

        setSubjects(nextSubjects);
        if (!nextSubjects.some((subject) => subject.id === routeSubjectId)) {
          setSubjectId("");
          setError(`Subject ${routeSubjectId} was not found in ${datasetId}.`);
          onSubjectReset();
          return;
        }

        if (routeSubjectId !== subjectId) {
          setSubjectId(routeSubjectId);
        }

        const nextSubject = nextSubjects.find((subject) => subject.id === routeSubjectId);
        const nextSource = resolveSource(source, nextSubject?.sources ?? []);
        if (nextSource !== source) {
          setSelectedTimeseriesSource(nextSource);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isCurrent) {
          setIsLoadingSubjects(false);
        }
      }
    }

    loadSubjects();

    return () => {
      isCurrent = false;
    };
  }, [datasetId, datasets, isLoadingDatasets, onSubjectReset, routeSubjectId, setSelectedTimeseriesSource]);

  return {
    datasets,
    subjects,
    datasetId,
    subjectId,
    selectedSubject,
    isSelectedSubjectReady,
    sourceOptions,
    isLoadingDatasets,
    isLoadingSubjects,
    subjectSourceError: error,
    setSubjectSourceError: setError,
  };
}
