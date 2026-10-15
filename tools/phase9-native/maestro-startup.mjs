export function isMaestroStartupFailure(log) {
  return log.includes('AndroidDriverTimeoutException') && !log.includes('> Flow ');
}
