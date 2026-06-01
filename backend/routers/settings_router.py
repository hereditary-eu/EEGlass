from __future__ import annotations

from fastapi import APIRouter

from backend.pydantic_models.settings import PatientAggregationSettings, PatientAggregationSettingsResponse
from backend.services.patient_aggregation_service import PatientAggregationService

settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("/patient-aggregation", response_model=PatientAggregationSettingsResponse)
async def get_patient_aggregation_settings() -> PatientAggregationSettingsResponse:
    return PatientAggregationService.get_settings_response()


@settings_router.put("/patient-aggregation", response_model=PatientAggregationSettingsResponse)
async def update_patient_aggregation_settings(
    settings: PatientAggregationSettings,
) -> PatientAggregationSettingsResponse:
    return PatientAggregationService.save_settings_response(settings)
