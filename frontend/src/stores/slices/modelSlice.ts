import type { StateCreator } from "zustand";

import { ModelService } from "../../services/ModelService";
import type { ModelInfoResponse, ModelListItem } from "../../types";
import type { AppStoreState } from "../useAppStore";

export interface ModelSlice {
  availableModels: ModelListItem[];
  modelInfo: ModelInfoResponse | null;
  isLoadingModels: boolean;
  isSwitchingModel: boolean;
  modelError: string | null;
  initializeModelState: () => Promise<void>;
  setCurrentModel: (modelName: string) => Promise<void>;
}

export const createModelSlice: StateCreator<AppStoreState, [], [], ModelSlice> = (set, get) => ({
  availableModels: [],
  modelInfo: null,
  isLoadingModels: false,
  isSwitchingModel: false,
  modelError: null,

  initializeModelState: async () => {
    if (get().isLoadingModels || get().modelInfo) {
      return;
    }

    set({ isLoadingModels: true, modelError: null });
    try {
      const modelList = await ModelService.getModelList();
      const modelInfo = await ModelService.getModelInfo(modelList.current_model_name);
      set({
        availableModels: modelList.models,
        modelInfo,
        isLoadingModels: false,
        modelError: null,
      });
    } catch (error) {
      set({
        modelInfo: null,
        isLoadingModels: false,
        modelError: getModelStateErrorMessage(error, "Unable to load model metadata."),
      });
    }
  },

  setCurrentModel: async (modelName: string) => {
    if (get().isSwitchingModel || get().modelInfo?.name === modelName) {
      return;
    }

    const previousModelInfo = get().modelInfo;
    set({ modelInfo: null, isSwitchingModel: true, modelError: null });
    try {
      const modelInfo = await ModelService.setCurrentModel(modelName);
      set({
        availableModels: get().availableModels.map((model) => ({
          ...model,
          is_current: model.name === modelInfo.name,
        })),
        modelInfo,
        isSwitchingModel: false,
        modelError: null,
      });
    } catch (error) {
      set({
        modelInfo: previousModelInfo,
        isSwitchingModel: false,
        modelError: getModelStateErrorMessage(error, "Unable to switch model."),
      });
    }
  },
});

function getModelStateErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}
