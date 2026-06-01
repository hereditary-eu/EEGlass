import type { VacpActionDescriptor, VacpCapabilitiesSnapshot, VacpRef, VacpStateSnapshot } from "@vacp/core";
import { nowIso, VACP_SCHEMA_VERSION } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";

import type { TimeseriesBandFilter, TimeseriesSource } from "../types";
import {
  createPrivateVacpGlobalKey,
  createVacpChartRefPrefix,
  registerVacpChart,
  VACP_APP_ID,
  VACP_APP_REF,
} from "./appBridge";

interface RegisterVacpScalpTopologyArgs {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  windowIndex: number | null;
  selectedBand: TimeseriesBandFilter;
  availableBands: TimeseriesBandFilter[];
  applyBandFilterOnClick: boolean;
  selectedTimeseriesBandFilter: TimeseriesBandFilter | null;
  selectBand: (band: TimeseriesBandFilter) => void;
  setApplyBandFilterOnClick: (shouldApply: boolean) => void;
  setSelectedTimeseriesBandFilter: (bandFilter: TimeseriesBandFilter | null) => void;
}

const SCALP_TOPOLOGY_CHART_ID = "patient-view/scalp-view";
const SCALP_TOPOLOGY_ACTIONS = {
  bandNext: "patient_view.scalp_view.band_next",
  bandPrevious: "patient_view.scalp_view.band_previous",
  bandSet: "patient_view.scalp_view.band_set",
  timeseriesClickFilterSelect: "patient_view.scalp_view.timeseries_click_filter_select",
  timeseriesClickFilterDeselect: "patient_view.scalp_view.timeseries_click_filter_deselect",
} as const;

export function registerVacpScalpTopology(args: RegisterVacpScalpTopologyArgs): () => void {
  const refPrefix = createVacpChartRefPrefix(SCALP_TOPOLOGY_CHART_ID);
  const bandRef = `${refPrefix}/band` as VacpRef;
  const clickFilterRef = `${refPrefix}/timeseries-click-filter` as VacpRef;
  const globalKey = createPrivateVacpGlobalKey(SCALP_TOPOLOGY_CHART_ID);
  const actions = new VacpActionRegistry();
  const availableBands = getAvailableBands(args);

  actions.register(
    createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandNext, bandRef, "Select the next scalp band."),
    () => {
      const band = getRelativeBand(args.selectedBand, availableBands, 1);
      args.selectBand(band);
      return { band };
    },
  );

  actions.register(
    createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandPrevious, bandRef, "Select the previous scalp band."),
    () => {
      const band = getRelativeBand(args.selectedBand, availableBands, -1);
      args.selectBand(band);
      return { band };
    },
  );

  actions.register(
    createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandSet, bandRef, "Select a specific scalp band.", {
      band: { type: "string", enum: availableBands },
    }),
    (params) => {
      const band = getBandParam(params, availableBands);
      if (!band) return { band, found: false };
      args.selectBand(band);
      return { band, found: true };
    },
  );

  actions.register(
    createActionDescriptor(
      SCALP_TOPOLOGY_ACTIONS.timeseriesClickFilterSelect,
      clickFilterRef,
      "Apply the selected scalp band to future timeseries clicks.",
    ),
    () => {
      args.setApplyBandFilterOnClick(true);
      args.setSelectedTimeseriesBandFilter(args.selectedBand);
      return { applyBandFilterOnClick: true, bandFilter: args.selectedBand };
    },
  );

  actions.register(
    createActionDescriptor(
      SCALP_TOPOLOGY_ACTIONS.timeseriesClickFilterDeselect,
      clickFilterRef,
      "Stop applying the selected scalp band to future timeseries clicks.",
    ),
    () => {
      args.setApplyBandFilterOnClick(false);
      args.setSelectedTimeseriesBandFilter(null);
      return { applyBandFilterOnClick: false, bandFilter: null };
    },
  );

  const bridge = installVacpRuntimeBridge({
    globalKey,
    sessionKey: `${VACP_APP_ID}:${SCALP_TOPOLOGY_CHART_ID}`,
    actions,
    snapshots: {
      getCapabilities: () => buildCapabilitiesSnapshot(args, refPrefix, bandRef, clickFilterRef),
      getState: () => buildStateSnapshot(args, refPrefix, bandRef, clickFilterRef),
    },
  });

  return registerVacpChart({
    id: SCALP_TOPOLOGY_CHART_ID,
    title: "Patient View Scalp View",
    refPrefix,
    globalKey,
    bridge,
  });
}

function buildCapabilitiesSnapshot(
  args: RegisterVacpScalpTopologyArgs,
  refPrefix: VacpRef,
  bandRef: VacpRef,
  clickFilterRef: VacpRef,
): VacpCapabilitiesSnapshot {
  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    graph: {
      version: VACP_SCHEMA_VERSION,
      nodes: [
        {
          ref: refPrefix,
          kind: "Visualization",
          layer: "VisualizationLayer",
          title: "Patient View Scalp View",
          description: "Scalp topology view with selectable frequency band and optional timeseries click filter.",
          data: {
            datasetId: args.datasetId,
            subjectId: args.subjectId,
            source: args.source,
            windowIndex: args.windowIndex,
          },
        },
        {
          ref: bandRef,
          kind: "Selection",
          layer: "InteractionFeedbackLayer",
          title: "Selected scalp band",
        },
        {
          ref: clickFilterRef,
          kind: "Selection",
          layer: "InteractionFeedbackLayer",
          title: "Apply selected band to timeseries clicks",
        },
      ],
      edges: [
        { from: VACP_APP_REF, to: refPrefix, kind: "contains" },
        { from: refPrefix, to: bandRef, kind: "contains" },
        { from: refPrefix, to: clickFilterRef, kind: "contains" },
      ],
      actions: [
        createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandNext, bandRef, "Select the next scalp band."),
        createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandPrevious, bandRef, "Select the previous scalp band."),
        createActionDescriptor(SCALP_TOPOLOGY_ACTIONS.bandSet, bandRef, "Select a specific scalp band.", {
          band: { type: "string", enum: getAvailableBands(args) },
        }),
        createActionDescriptor(
          SCALP_TOPOLOGY_ACTIONS.timeseriesClickFilterSelect,
          clickFilterRef,
          "Apply the selected scalp band to future timeseries clicks.",
        ),
        createActionDescriptor(
          SCALP_TOPOLOGY_ACTIONS.timeseriesClickFilterDeselect,
          clickFilterRef,
          "Stop applying the selected scalp band to future timeseries clicks.",
        ),
      ],
    },
  };
}

function buildStateSnapshot(
  args: RegisterVacpScalpTopologyArgs,
  refPrefix: VacpRef,
  bandRef: VacpRef,
  clickFilterRef: VacpRef,
): VacpStateSnapshot {
  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    state: {
      [refPrefix]: {
        datasetId: args.datasetId,
        subjectId: args.subjectId,
        source: args.source,
        windowIndex: args.windowIndex,
      },
      [bandRef]: {
        availableBands: getAvailableBands(args),
        selectedBand: args.selectedBand,
      },
      [clickFilterRef]: {
        applyBandFilterOnClick: args.applyBandFilterOnClick,
        selectedTimeseriesBandFilter: args.selectedTimeseriesBandFilter,
      },
    },
    summary: {
      [refPrefix]: `${args.subjectId} ${args.source}; scalp band=${args.selectedBand}; apply to timeseries clicks=${
        args.applyBandFilterOnClick ? "selected" : "deselected"
      }.`,
    },
  };
}

function createActionDescriptor(
  name: string,
  targetRef: VacpRef,
  description: string,
  properties: Record<string, unknown> = {},
): VacpActionDescriptor {
  return {
    name,
    targetRef,
    title: name.replace(/^patient_view\.scalp_view\./, "").replace(/_/g, " "),
    description,
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", const: targetRef },
        ...properties,
      },
      required: Object.keys(properties),
    },
  };
}

function getAvailableBands(args: RegisterVacpScalpTopologyArgs): TimeseriesBandFilter[] {
  return args.availableBands.length ? args.availableBands : [args.selectedBand];
}

function getRelativeBand(
  selectedBand: TimeseriesBandFilter,
  availableBands: TimeseriesBandFilter[],
  direction: 1 | -1,
): TimeseriesBandFilter {
  const currentIndex = availableBands.indexOf(selectedBand);
  const nextIndex = (currentIndex + direction + availableBands.length) % availableBands.length;
  return availableBands[nextIndex];
}

function getBandParam(params: unknown, availableBands: TimeseriesBandFilter[]): TimeseriesBandFilter | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const band = (params as { band?: unknown }).band;
  return typeof band === "string" && availableBands.includes(band as TimeseriesBandFilter)
    ? (band as TimeseriesBandFilter)
    : null;
}
