from __future__ import annotations

from fastapi import APIRouter

from backend.pydantic_models.settings import PatientAggregationSettings
from backend.services.patient_aggregation_service import PatientAggregationService

settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("/patient-aggregation", response_model=PatientAggregationSettings)
async def get_patient_aggregation_settings() -> PatientAggregationSettings:
    return PatientAggregationService.get_settings()


@settings_router.put("/patient-aggregation", response_model=PatientAggregationSettings)
async def update_patient_aggregation_settings(
    settings: PatientAggregationSettings,
) -> PatientAggregationSettings:
    return PatientAggregationService.save_settings(settings)
