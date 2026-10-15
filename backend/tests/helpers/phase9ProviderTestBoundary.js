import assert from 'node:assert/strict';
import express from 'express';

export async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Provider operation did not settle')), 1500);
    })]);
  } finally { clearTimeout(timer); }
}

export function providerRequest(input, options = {}) {
  return fetch(input, { ...options, signal: AbortSignal.timeout(1500) });
}

export async function waitForProviderObservation(predicate) {
  let poll;
  try {
    await bounded(new Promise(resolve => {
      poll = setInterval(() => { if (predicate()) resolve(); }, 5);
    }));
  } finally { clearInterval(poll); }
}

export function installProviderTestBoundary(t) {
  const servers = [], original = express.application.listen;
  t.mock.method(express.application, 'listen', function (...args) {
    const server = original.apply(this, args);
    servers.push(server);
    return server;
  });
  t.after(() => {
    for (const server of servers) { server.closeAllConnections(); server.close(); }
  });
  return {
    assertLoopback() { for (const server of servers) assert.equal(server.address()?.address, '127.0.0.1'); },
    servers,
  };
}
