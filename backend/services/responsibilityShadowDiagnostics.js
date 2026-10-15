// Capture the exact validated envelope alongside the derived result. This does
// not evaluate policy or create human/financial authority.
export function responsibilityShadowDiagnostics(envelope, validation) {
  return { analysisEnvelope: envelope, factualValidation: validation };
}
