import { useEffect, useId, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { TimeseriesSubjectSplit } from "../types";
import { requestAppLayoutResize } from "../utils/vegaLayout";

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
  const assistantDrawerId = useId();
  const isPatientViewRoute = /^\/datasets\/[^/]+\/patients\/[^/]+/.test(pathname);
  const pageTitle = isPatientViewRoute
    ? "Patient View"
    : pathname === "/components"
      ? "Retained Components"
      : "Overview";
  const [patientViewHeaderDetails, setPatientViewHeaderDetails] = useState<PatientViewHeaderDetails | null>(null);
  const [isAssistantDrawerOpen, setIsAssistantDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isAssistantDrawerOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAssistantDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAssistantDrawerOpen]);

  useEffect(() => {
    requestAppLayoutResize();
    const halfwayResize = window.setTimeout(requestAppLayoutResize, 90);
    const settledResize = window.setTimeout(requestAppLayoutResize, 220);

    return () => {
      window.clearTimeout(halfwayResize);
      window.clearTimeout(settledResize);
    };
  }, [isAssistantDrawerOpen]);

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
    <main
      className={[
        "app-shell",
        isPatientViewRoute ? "app-shell--patient-view" : "",
        isAssistantDrawerOpen ? "app-shell--assistant-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={isPatientViewRoute ? "app-layout app-layout--patient-view" : "app-layout"}>
        <header className="app-header">
          <div>
            <p className="app-eyebrow">All In On EEG</p>
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
            <button
              type="button"
              className={isAssistantDrawerOpen ? "app-assistant-toggle is-active" : "app-assistant-toggle"}
              aria-controls={assistantDrawerId}
              aria-expanded={isAssistantDrawerOpen}
              aria-label={isAssistantDrawerOpen ? "Close assistant drawer" : "Open assistant drawer"}
              onClick={() => setIsAssistantDrawerOpen((current) => !current)}
            >
              AI
            </button>
          </nav>
        </header>

        <Outlet context={{ setPatientViewHeaderDetails } satisfies PatientViewOutletContext} />
      </div>

      {isAssistantDrawerOpen ? (
        <button
          type="button"
          className="app-assistant-backdrop"
          aria-label="Close assistant drawer"
          onClick={() => setIsAssistantDrawerOpen(false)}
        />
      ) : null}
      <aside
        id={assistantDrawerId}
        className={isAssistantDrawerOpen ? "app-assistant-drawer is-open" : "app-assistant-drawer"}
        aria-hidden={!isAssistantDrawerOpen}
        aria-label="Assistant drawer"
      >
        <div className="app-assistant-drawer-header">
          <div>
            <p className="app-assistant-eyebrow">App Assistant</p>
            <h2 className="app-assistant-title">Ask About This View</h2>
          </div>
          <button
            type="button"
            className="app-assistant-close"
            aria-label="Close assistant drawer"
            tabIndex={isAssistantDrawerOpen ? 0 : -1}
            onClick={() => setIsAssistantDrawerOpen(false)}
          >
            X
          </button>
        </div>

        <div className="app-assistant-context" aria-label="Current app context">
          <span>{pageTitle}</span>
          {patientViewHeaderDetails ? <span>{patientViewHeaderDetails.datasetId}</span> : null}
          {patientViewHeaderDetails ? <span>{patientViewHeaderDetails.subjectId}</span> : null}
          {patientViewHeaderDetails?.trueLabel ? <span>{patientViewHeaderDetails.trueLabel}</span> : null}
        </div>

        <div className="app-assistant-thread" role="log" aria-label="Assistant messages">
          <div className="app-assistant-empty">
            <p>Assistant integration pending.</p>
          </div>
        </div>

        <form className="app-assistant-composer" onSubmit={(event) => event.preventDefault()}>
          <label className="app-assistant-composer-label" htmlFor={`${assistantDrawerId}-prompt`}>
            Prompt
          </label>
          <textarea id={`${assistantDrawerId}-prompt`} rows={3} placeholder="Ask about the current app state" disabled />
          <button type="submit" disabled>
            Send
          </button>
        </form>
      </aside>
    </main>
  );
}
