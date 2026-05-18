import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

export interface PatientViewHeaderDetails {
  datasetId: string;
  subjectId: string;
  trueLabel?: string | null;
}

export interface PatientViewOutletContext {
  setPatientViewHeaderDetails: (details: PatientViewHeaderDetails | null) => void;
}

export function AppLayout() {
  const { pathname } = useLocation();
  const isPatientViewRoute = /^\/datasets\/[^/]+\/patients\/[^/]+/.test(pathname);
  const pageTitle = isPatientViewRoute ? "Patient View" : pathname === "/components" ? "Retained Components" : "Overview";
  const [patientViewHeaderDetails, setPatientViewHeaderDetails] = useState<PatientViewHeaderDetails | null>(null);

  return (
    <main className={isPatientViewRoute ? "app-shell app-shell--patient-view" : "app-shell"}>
      <div className={isPatientViewRoute ? "app-layout app-layout--patient-view" : "app-layout"}>
        <header className="app-header">
          <div>
            <p className="app-eyebrow">All In On EEG</p>
            <div className="app-title-row">
              <h1 className="app-title">{pageTitle}</h1>
              {isPatientViewRoute && patientViewHeaderDetails ? (
                <div className="app-patient-identity" aria-label="Selected patient">
                  <span className="app-patient-dataset">{patientViewHeaderDetails.datasetId}</span>
                  <span className="app-patient-subject">{patientViewHeaderDetails.subjectId}</span>
                  {patientViewHeaderDetails.trueLabel ? (
                    <span className="app-patient-label">{patientViewHeaderDetails.trueLabel}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <nav className="app-nav" aria-label="Primary">
            <NavLink
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link--active" : "app-nav-link")}
              to="/"
              end
            >
              Overview
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "app-nav-link app-nav-link--active" : "app-nav-link")}
              to="/components"
            >
              Components
            </NavLink>
          </nav>
        </header>

        <Outlet context={{ setPatientViewHeaderDetails } satisfies PatientViewOutletContext} />
      </div>
    </main>
  );
}
