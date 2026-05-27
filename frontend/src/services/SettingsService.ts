import { ApiClient } from "./ApiClient";
import { API_ROUTES } from "./ApiRoutes";
import type { PatientAggregationSettings } from "../types";

export class SettingsService {
  static async getPatientAggregationSettings(): Promise<PatientAggregationSettings> {
    return ApiClient.get<PatientAggregationSettings>(API_ROUTES.settings.patientAggregation);
  }

  static async updatePatientAggregationSettings(
    settings: PatientAggregationSettings,
  ): Promise<PatientAggregationSettings> {
    return ApiClient.put<PatientAggregationSettings>(API_ROUTES.settings.patientAggregation, settings);
  }
}
