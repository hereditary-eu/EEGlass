export const EEG_MODEL_NOTATION = {
  inputWindow: "V_c(t)",
  bandPowerFeature: "W_{c,f}(t)",
  spatialWeight: "w_{f,c}",
  spatialEvidence: "X_f(t)=\\sum_c w_{f,c}W_{c,f}(t)",
  encoderOutput: "Z_f",
  classLogits: "\\Omega",
} as const;

export const EEG_MODEL_NOTATION_LABELS = {
  inputLayer: "Input layer: selected EEG window",
  filterBank: "Filter bank: band-power features from",
  spatialLayer: "Spatial layer: learned channel weights",
  spatialEvidencePrefix: "Spatial layer evidence from",
  spatialEvidenceConnector: "and window band power before",
  denseLayerPrefix: "Dense layer:",
  denseLayerConnector: "mapped to class logits",
  decisionArgmaxPrefix: "Decision: argmax(",
  bandActivationDenseMultiplier: "x dense multiplier",
  encoderOutputPrefix: "Encoder output",
  encoderBeforeDenseWeights: "before dense weights",
  windowEmbeddingPrefix: "Encoder output: penultimate representation before",
} as const;
