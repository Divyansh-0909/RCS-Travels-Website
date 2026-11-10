import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Reproduce Vite's extension resolution for this one pure constants import.
// Production sources are not changed and all content assertions still run.
const legalSource = pathToFileURL(path.resolve('frontend/src/constants/legal.js')).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './cancellation' && context.parentURL === legalSource ? './cancellation.js' : specifier, context);
} });
