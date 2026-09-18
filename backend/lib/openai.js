import OpenAI from "openai";

const rawOpenAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Protect the OpenAI account from accidental request spikes. OpenAI calls are
// expensive and are triggered by user input, so keep a small queue in front of
// every SDK request made by this backend.
const MAX_REQUESTS_PER_MINUTE = Number(process.env.OPENAI_RATE_LIMIT_PER_MINUTE ?? 60);
const requestTimes = [];

async function waitForRateLimit() {
  while (true) {
    const now = Date.now();
    while (requestTimes.length && requestTimes[0] <= now - 60_000) {
      requestTimes.shift();
    }

    if (requestTimes.length < MAX_REQUESTS_PER_MINUTE) {
      requestTimes.push(now);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

export const openai = new Proxy(rawOpenAI, {
  get(target, property) {
    const value = target[property];
    if (property !== "responses" || !value) return value;

    return new Proxy(value, {
      get(responses, method) {
        const operation = responses[method];
        if (typeof operation !== "function") return operation;

        return async (...args) => {
          await waitForRateLimit();
          return operation.apply(responses, args);
        };
      },
    });
  },
});
