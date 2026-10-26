# EEGlass: Disclaimer

This file is the release disclaimer required by the HEREDITARY misuse self-assessment (D9.1, Ethics Requirement 1). EEGlass is a visualisation tool: it shows how a small research classifier behaves on a fixed public EEG cohort. The public demo cannot load recordings of new patients, and the tool has no clinical function.

> **Research use only. Not a medical device.**
> This software was developed in the HEREDITARY project as a research prototype. It has not been assessed or certified under the EU Medical Device Regulation (EU) 2017/745. It must not be used to diagnose, treat, monitor or make any other decision about individual patients.

<!-- Shown in the user interface, right of the page title in the header of every view (`frontend/src/layouts/AppLayout.tsx`): "Research prototype · Not a medical device · Not for clinical use" -->

## 1. Overview

| Field | Value |
|---|---|
| Name | EEGlass |
| Version | V1.0 |
| Type | Demo or web application (with source code and trained model weights) |
| Owner partner and contact | TU Graz (IVC); Peter Waldert, peter.waldert@tugraz.at |
| License | MIT (see [`LICENSE`](LICENSE)), in line with the WP5 licensing policy (D5.2, "Component FAIRification"). One training helper is adapted from selfEEG (MIT, Copyright (c) 2023 MedMax Team), attributed in `backend/ml/shallownet_utils.py`. |
| Repository and DOI | https://github.com/hereditary-eu/EEGlass — demo: https://hereditary.cgv.tugraz.at/all-in-on-eeg/ — paper: https://doi.org/10.2312/vcbm.20261002 — Zenodo DOI pending |
| Release date | Repository public since 2026-06-07; V1.0 with VCBM 2026 |
| Related task or deliverable | WP5, T5.1; D5.1, D5.2 |
| How to cite | Waldert et al., *EEGlass: A Fully Interpretable EEG Dementia Screening Assistant*, VCBM 2026. https://doi.org/10.2312/vcbm.20261002 |

## 2. Intended use

**Primary intended use.** Research into interpretable machine learning for EEG, through visualisation. EEGlass makes every step of the xEEGNet classifier inspectable — fixed bandpass filters, learned spatial mixing, band power, linear classifier — so that a researcher can see which channels and frequency bands drove a dementia-screening prediction, instead of reading a post-hoc saliency map. It also serves as an EEG database viewer over the bundled public cohort.

**Intended users.** Biomedical and visualization researchers, data scientists, and developers building on interpretable EEG models.

**Out-of-scope uses.** This release must not be used for
- clinical diagnosis, prognosis or treatment of individual patients;
- decisions about individuals, such as insurance, employment or access to care;
- re-identification of individuals or linkage with other data sources;
- populations, devices or data types not described in Section 3 — in particular, any EEG montage, sampling rate or recording site other than the one used in ds004504.

## 3. Data provenance

| Dataset | Source partner | Type | Population | Ethics approval or access conditions |
|---|---|---|---|---|
| OpenNeuro `ds004504` — EEG recordings from Alzheimer's disease, Frontotemporal dementia and Healthy subjects (Miltiadous et al.) | External, public (AHEPA University Hospital, Thessaloniki) | Public, de-identified | 88 subjects (AD, FTD, cognitively normal), 19-channel scalp EEG, single site, Greece | Publicly released under CC0; collected under hospital ethics protocol 142/12-04-2023. No HEREDITARY partner data used. |

This repository and the released files contain no personal data, pseudonymized records, identifiers or pseudonymization keys. The dataset is fetched at deployment time by a separate downloader container from a TU Graz-hosted copy (`DATASET_URL` on `cloud.tugraz.at` in `docker-compose.yml`); it is not vendored in the repository.

## 4. Method

- **Algorithm or architecture.** xEEGNet — 7 fixed FIR bandpass filters (δ, θ, α, β1–β3, γ) → learned spatial mixing over 19 channels → batch norm and log band power → linear 3-class classifier. 168 trainable parameters; every intermediate value has a direct physical meaning. Optional node-SCC checkpoints add 7 spectral-coherence activations alongside the 7 band-power ones. Embeddings viewable under PCA (default), t-SNE or UMAP.
- **Training setting.** Centralized, on the public dataset only.
- **Optional language-model assistant.** The dashboard includes a chat assistant (VACP debug overlay, `frontend/src/vacp/`) that can read and operate the views. It is off until a user enters their own API key for an OpenAI-compatible endpoint (default `api.openai.com`) or Google Gemini. The browser then sends the chat and the dashboard state (public cohort data and model outputs) **directly to that provider**, which may be outside the EU/EEA. The key, the provider settings and the chat history stay in the user's browser (`localStorage`); the EEGlass backend neither sees nor stores them. Do not type personal or patient data into the chat.
- **Privacy techniques.** None applied, and none required: no personal data is processed. The model's 168-parameter capacity makes memorization of individual recordings negligible by construction.

## 5. Performance

- **Evaluation data.** Offline evaluation on `ds004504` only; internal validation, no external cohort, no prospective validation. TRL 3–4.
- **Metrics and results.** Three-class (AD / FTD / CN) window-level classification. See the VCBM 2026 paper for the reported figures; the dashboard itself reports per-window predictions with their band and channel contributions rather than a single headline score.
- **Results by subgroup.** Not reported. The cohort is too small and comes from a single site, so subgroup estimates (by age, sex, site) would not be meaningful.

## 6. Known limitations and risks

- **Generalizability.** Unknown outside the 88-subject single-site cohort. Performance on other montages, amplifiers, sampling rates, preprocessing pipelines or populations has not been measured.
- **Known biases and confounders.** Single recording site and single acquisition protocol; site-specific artifacts and filter settings may be learned as signal. Class balance in `ds004504` is uneven.
- **Failure modes.** Short or artifact-heavy windows, non-19-channel recordings, and montages differing from the training setup yield unreliable output. The model classifies 4-second windows, so single-window predictions are noisy by design and must be read alongside the per-patient aggregate views.
- **Privacy risks.** No membership-inference or model-inversion test was run; it was judged unnecessary because training data is public and de-identified and the model has 168 parameters. The only data egress is the opt-in chat assistant (Section 4), which sends what the user types and the public dashboard state to the provider the user chose.

## 7. Responsible use and reporting

- **Terms of use.** Public read-only demo; no user data upload path. Licensed under MIT (`LICENSE`).
- **Pre-release actions.** This disclaimer is linked from the repository README, the repository carries an MIT `LICENSE` file, and the interface shows a short not-a-medical-device line (right of the page title in the header of every view, `frontend/src/layouts/AppLayout.tsx`).
- **Contact for misuse or vulnerability reports.** peter.waldert@tugraz.at

## 8. Acknowledgement

Funded by the European Union under grant agreement No 101137074 (HEREDITARY). Views and opinions expressed are however those of the author(s) only and do not necessarily reflect those of the European Union or the European Health and Digital Executive Agency (HaDEA). Neither the European Union nor the granting authority can be held responsible for them.
