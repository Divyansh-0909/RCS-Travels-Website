/** The production clock always returns an independent Date instance. */
export const systemClock = {
  now: () => new Date(),
}
