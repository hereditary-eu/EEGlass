import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import type { TimeseriesSubjectSplit } from "../types";
import euLogo from "../assets/logos/funded-by-the-eu.png";
import hereditaryLogo from "../assets/logos/hereditary.png";

export interface PatientViewHeaderDetails {
  datasetId: string;
  subjectId: string;
  trueLabel?: string | null;
  subjectSplit?: TimeseriesSubjectSplit | null;
}

export interface PatientViewOutletContext {
  setPatientViewHeaderDetails: (details: PatientViewHeaderDetails | null) => void;
}

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPatientViewRoute = /^\/datasets\/[^/]+\/patients\/[^/]+/.test(pathname);
  const pageTitle = isPatientViewRoute ? "Patient View" : "Overview";
  const [patientViewHeaderDetails, setPatientViewHeaderDetails] = useState<PatientViewHeaderDetails | null>(null);

  const returnToPatientDirectory = () => {
    if (!patientViewHeaderDetails) {
      return;
    }

    navigate("/", {
      state: {
        datasetId: patientViewHeaderDetails.datasetId,
        directoryLevel: "patients",
        selectedSubjectId: null,
      },
    });
  };

  return (
    <main className={["app-shell", isPatientViewRoute ? "app-shell--patient-view" : ""].filter(Boolean).join(" ")}>
      <div className={isPatientViewRoute ? "app-layout app-layout--patient-view" : "app-layout"}>
        <header className="app-header">
          <div>
            <p className="app-eyebrow">EEGlass</p>
            <div className="app-title-row">
              <h1 className="app-title">{pageTitle}</h1>
              {isPatientViewRoute && patientViewHeaderDetails ? (
                <div className="app-patient-identity" aria-label="Selected patient">
                  <button
                    type="button"
                    className="app-patient-dataset"
                    onClick={returnToPatientDirectory}
                    aria-label={`Return to ${patientViewHeaderDetails.datasetId} patients`}
                  >
                    {patientViewHeaderDetails.datasetId}
                  </button>
                  <span className="app-patient-subject">{patientViewHeaderDetails.subjectId}</span>
                  {patientViewHeaderDetails.subjectSplit ? (
                    <span className="app-patient-split">{patientViewHeaderDetails.subjectSplit}</span>
                  ) : null}
                  {patientViewHeaderDetails.trueLabel ? (
                    <span className="app-patient-label">{patientViewHeaderDetails.trueLabel}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="app-header-meta">
            <p className="app-disclaimer">Research prototype · Not a medical device · Not for clinical use</p>
            <a
              className="app-logos"
              href="https://hereditary-project.eu/"
              target="_blank"
              rel="noreferrer"
              title="HEREDITARY · funded by the European Union under grant agreement No 101137074"
            >
              <img src={hereditaryLogo} alt="HEREDITARY" className="app-logo app-logo--hereditary" />
              <img src={euLogo} alt="Funded by the European Union" className="app-logo app-logo--eu" />
            </a>
          </div>
        </header>

        <Outlet context={{ setPatientViewHeaderDetails } satisfies PatientViewOutletContext} />
      </div>
    </main>
  );
}
