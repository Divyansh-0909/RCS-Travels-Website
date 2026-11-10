// Values come from the same source as the website's generated --ride-* variables.
// Shared tokens are CommonJS so Node's CSS generator and Metro use the same values.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rideChrome } = require('../../../shared/theme/tokens.cjs') as {
  rideChrome: { background: string; foreground: string; handle: string; sheetShadow: string };
};

export default rideChrome;
