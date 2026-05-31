import type { VacpActionDescriptor, VacpCapabilitiesSnapshot, VacpRef, VacpStateSnapshot } from "@vacp/core";
import { nowIso, VACP_SCHEMA_VERSION } from "@vacp/core";
import { installVacpRuntimeBridge, VacpActionRegistry } from "@vacp/gateway";

import type { ModelPredictionSummary, TimeseriesSubjectInfo } from "../types";
import {
  createPrivateVacpGlobalKey,
  createVacpChartRefPrefix,
  registerVacpChart,
  VACP_APP_ID,
  VACP_APP_REF,
} from "./appBridge";

interface RegisterVacpPatientListArgs {
  subjects: TimeseriesSubjectInfo[];
  selectedDatasetId: string;
  isLoadingSubjects: boolean;
  predictionSummariesBySubject: Map<string, ModelPredictionSummary>;
  hoveredSubjectId: string | null;
  selectedSubjectId: string | null;
  getFocusedSubjectId: () => string | null;
  focusSubject: (subjectId: string) => void;
  toggleSubject: (subjectId: string) => void;
  openSubject: (subjectId: string) => void;
}

const PATIENT_LIST_CHART_ID = "overview/patient-list";
const PATIENT_LIST_ACTIONS = {
  focusNext: "overview.patient_list.focus_next",
  focusPrevious: "overview.patient_list.focus_previous",
  focusSubject: "overview.patient_list.focus_subject",
  toggleFocused: "overview.patient_list.toggle_focused",
  toggleSubject: "overview.patient_list.toggle_subject",
  openFocused: "overview.patient_list.open_focused",
  openSubject: "overview.patient_list.open_subject",
} as const;

export function registerVacpPatientList(args: RegisterVacpPatientListArgs): () => void {
  const refPrefix = createVacpChartRefPrefix(PATIENT_LIST_CHART_ID);
  const focusRef = `${refPrefix}/focus` as VacpRef;
  const selectionRef = `${refPrefix}/selection` as VacpRef;
  const globalKey = createPrivateVacpGlobalKey(PATIENT_LIST_CHART_ID);
  const actions = new VacpActionRegistry();

  actions.register(
    createActionDescriptor(PATIENT_LIST_ACTIONS.focusNext, refPrefix, "Focus next patient tile."),
    () => {
      const subject = getRelativeSubject(args, 1);
      if (!subject) return { focusedSubjectId: null };
      args.focusSubject(subject.id);
      return { focusedSubjectId: subject.id };
    },
  );

  actions.register(
    createActionDescriptor(PATIENT_LIST_ACTIONS.focusPrevious, refPrefix, "Focus previous patient tile."),
    () => {
      const subject = getRelativeSubject(args, -1);
      if (!subject) return { focusedSubjectId: null };
      args.focusSubject(subject.id);
      return { focusedSubjectId: subject.id };
    },
  );

  actions.register(
    createActionDescriptor(PATIENT_LIST_ACTIONS.focusSubject, refPrefix, "Focus a patient tile by subject id.", {
      subjectId: { type: "string" },
    }),
    (params) => {
      const subject = getSubjectFromParams(args, params);
      if (!subject) return { focusedSubjectId: null, found: false };
      args.focusSubject(subject.id);
      return { focusedSubjectId: subject.id, found: true };
    },
  );

  actions.register(
    createActionDescriptor(PATIENT_LIST_ACTIONS.toggleFocused, selectionRef, "Select or deselect the focused patient."),
    () => {
      const subject = getFocusedSubject(args);
      if (!subject) return { selectedSubjectId: args.selectedSubjectId, found: false };
      args.toggleSubject(subject.id);
      return { selectedSubjectId: args.selectedSubjectId === subject.id ? null : subject.id, found: true };
    },
  );

  actions.register(
    createActionDescriptor(
      PATIENT_LIST_ACTIONS.toggleSubject,
      selectionRef,
      "Select or deselect a patient by subject id.",
      { subjectId: { type: "string" } },
    ),
    (params) => {
      const subject = getSubjectFromParams(args, params);
      if (!subject) return { selectedSubjectId: args.selectedSubjectId, found: false };
      args.toggleSubject(subject.id);
      return { selectedSubjectId: args.selectedSubjectId === subject.id ? null : subject.id, found: true };
    },
  );

  actions.register(
    createActionDescriptor(PATIENT_LIST_ACTIONS.openFocused, refPrefix, "Open the focused patient's details view."),
    () => {
      const subject = getFocusedSubject(args);
      if (!subject) return { openedSubjectId: null, found: false };
      args.openSubject(subject.id);
      return { openedSubjectId: subject.id, found: true };
    },
  );

  actions.register(
    createActionDescriptor(
      PATIENT_LIST_ACTIONS.openSubject,
      refPrefix,
      "Open a patient's details view by subject id.",
      { subjectId: { type: "string" } },
    ),
    (params) => {
      const subject = getSubjectFromParams(args, params);
      if (!subject) return { openedSubjectId: null, found: false };
      args.openSubject(subject.id);
      return { openedSubjectId: subject.id, found: true };
    },
  );

  const bridge = installVacpRuntimeBridge({
    globalKey,
    sessionKey: `${VACP_APP_ID}:${PATIENT_LIST_CHART_ID}`,
    actions,
    snapshots: {
      getCapabilities: () => buildCapabilitiesSnapshot(args, refPrefix, focusRef, selectionRef),
      getState: () => buildStateSnapshot(args, refPrefix, focusRef, selectionRef),
    },
  });

  return registerVacpChart({
    id: PATIENT_LIST_CHART_ID,
    title: "Overview Patient List",
    refPrefix,
    globalKey,
    bridge,
  });
}

function buildCapabilitiesSnapshot(
  args: RegisterVacpPatientListArgs,
  refPrefix: VacpRef,
  focusRef: VacpRef,
  selectionRef: VacpRef,
): VacpCapabilitiesSnapshot {
  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    graph: {
      version: VACP_SCHEMA_VERSION,
      nodes: [
        {
          ref: refPrefix,
          kind: "View",
          layer: "ViewLayer",
          title: "Overview Patient List",
          description: "Dataset patient tiles with keyboard-like focus, selection, and open-details controls.",
          data: {
            datasetId: args.selectedDatasetId,
            patientCount: args.subjects.length,
            patientIds: args.subjects.map((subject) => subject.id),
          },
        },
        {
          ref: focusRef,
          kind: "InteractionTarget",
          layer: "InteractionFeedbackLayer",
          title: "Focused patient tile",
        },
        {
          ref: selectionRef,
          kind: "Selection",
          layer: "InteractionFeedbackLayer",
          title: "Selected patient tile",
        },
      ],
      edges: [
        { from: VACP_APP_REF, to: refPrefix, kind: "contains" },
        { from: refPrefix, to: focusRef, kind: "contains" },
        { from: refPrefix, to: selectionRef, kind: "contains" },
      ],
      actions: Object.values(PATIENT_LIST_ACTIONS).map((name) =>
        createPatientListActionDescriptor(name, refPrefix, selectionRef),
      ),
    },
  };
}

function buildStateSnapshot(
  args: RegisterVacpPatientListArgs,
  refPrefix: VacpRef,
  focusRef: VacpRef,
  selectionRef: VacpRef,
): VacpStateSnapshot {
  const focusedSubjectId = args.getFocusedSubjectId();
  const patients = args.subjects.map((subject, index) => {
    const summary = args.predictionSummariesBySubject.get(subject.id) ?? null;
    return {
      index,
      subjectId: subject.id,
      split: subject.subject_split ?? null,
      trueLabel: summary?.true_label ?? subject.subject_label ?? null,
      predictedLabel: summary?.predicted_label ?? null,
      meanConfidence: summary?.mean_confidence ?? null,
      isFocused: subject.id === focusedSubjectId,
      isHovered: subject.id === args.hoveredSubjectId,
      isSelected: subject.id === args.selectedSubjectId,
    };
  });

  return {
    version: VACP_SCHEMA_VERSION,
    createdAt: nowIso(),
    state: {
      [refPrefix]: {
        datasetId: args.selectedDatasetId,
        isLoading: args.isLoadingSubjects,
        patientCount: args.subjects.length,
        focusedSubjectId,
        hoveredSubjectId: args.hoveredSubjectId,
        selectedSubjectId: args.selectedSubjectId,
        patients,
      },
      [focusRef]: { subjectId: focusedSubjectId },
      [selectionRef]: { subjectId: args.selectedSubjectId },
    },
    summary: {
      [refPrefix]: `${args.subjects.length} patients in ${
        args.selectedDatasetId || "no dataset"
      }; selected=${args.selectedSubjectId ?? "none"}; focused=${focusedSubjectId ?? "none"}.`,
    },
  };
}

function createPatientListActionDescriptor(
  name: string,
  refPrefix: VacpRef,
  selectionRef: VacpRef,
): VacpActionDescriptor {
  const needsSubjectId =
    name === PATIENT_LIST_ACTIONS.focusSubject ||
    name === PATIENT_LIST_ACTIONS.toggleSubject ||
    name === PATIENT_LIST_ACTIONS.openSubject;
  return createActionDescriptor(
    name,
    getActionTargetRef(name, refPrefix, selectionRef),
    getActionDescription(name),
    needsSubjectId ? { subjectId: { type: "string" } } : {},
  );
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
    title: name.replace(/^overview\.patient_list\./, "").replace(/_/g, " "),
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

function getActionTargetRef(name: string, refPrefix: VacpRef, selectionRef: VacpRef): VacpRef {
  return name === PATIENT_LIST_ACTIONS.toggleFocused || name === PATIENT_LIST_ACTIONS.toggleSubject
    ? selectionRef
    : refPrefix;
}

function getActionDescription(name: string): string {
  switch (name) {
    case PATIENT_LIST_ACTIONS.focusNext:
      return "Focus next patient tile.";
    case PATIENT_LIST_ACTIONS.focusPrevious:
      return "Focus previous patient tile.";
    case PATIENT_LIST_ACTIONS.focusSubject:
      return "Focus a patient tile by subject id.";
    case PATIENT_LIST_ACTIONS.toggleFocused:
      return "Select or deselect the focused patient.";
    case PATIENT_LIST_ACTIONS.toggleSubject:
      return "Select or deselect a patient by subject id.";
    case PATIENT_LIST_ACTIONS.openFocused:
      return "Open the focused patient's details view.";
    case PATIENT_LIST_ACTIONS.openSubject:
      return "Open a patient's details view by subject id.";
    default:
      return "Interact with the patient list.";
  }
}

function getRelativeSubject(args: RegisterVacpPatientListArgs, direction: 1 | -1): TimeseriesSubjectInfo | null {
  if (!args.subjects.length) return null;
  const focusedSubjectId = args.getFocusedSubjectId() ?? args.hoveredSubjectId ?? args.selectedSubjectId;
  const currentIndex = focusedSubjectId ? args.subjects.findIndex((subject) => subject.id === focusedSubjectId) : -1;
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : args.subjects.length - 1
      : (currentIndex + direction + args.subjects.length) % args.subjects.length;
  return args.subjects[nextIndex] ?? null;
}

function getFocusedSubject(args: RegisterVacpPatientListArgs): TimeseriesSubjectInfo | null {
  const focusedSubjectId = args.getFocusedSubjectId() ?? args.hoveredSubjectId ?? args.selectedSubjectId;
  if (!focusedSubjectId) return null;
  return args.subjects.find((subject) => subject.id === focusedSubjectId) ?? null;
}

function getSubjectFromParams(args: RegisterVacpPatientListArgs, params: unknown): TimeseriesSubjectInfo | null {
  const subjectId = getSubjectIdParam(params);
  if (!subjectId) return null;
  return args.subjects.find((subject) => subject.id === subjectId) ?? null;
}

function getSubjectIdParam(params: unknown): string | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const subjectId = (params as { subjectId?: unknown }).subjectId;
  return typeof subjectId === "string" && subjectId.length ? subjectId : null;
}
