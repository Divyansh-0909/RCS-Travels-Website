#!/usr/bin/env node

/**
 * Run the atlas generator alongside Vite and keep both in sync with the
 * repository. This intentionally watches source/config files only: generated
 * output must never trigger another scan.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const atlasDirectory = path.resolve(scriptDirectory, '..');
const repositoryDirectory = path.resolve(atlasDirectory, '..', '..');
const generatedFile = path.join(atlasDirectory, 'src', 'generated-atlas.js');
const debounceMilliseconds = 350;

const sourceGlobs = [
  path.join(repositoryDirectory, 'backend', '**', '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json}'),
  path.join(repositoryDirectory, 'frontend', '**', '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json}'),
  path.join(repositoryDirectory, 'driver-app', '**', '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json}'),
  path.join(repositoryDirectory, 'shared', '**', '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json}'),
  path.join(repositoryDirectory, 'tools', '**', '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json}'),
  path.join(repositoryDirectory, '*.{js,jsx,mjs,cjs,ts,tsx,prisma,json,yml,yaml}'),
];

const ignored = [
  '**/node_modules/**',
  '**/build/**',
  '**/dist/**',
  '**/.git/**',
  '**/generated-atlas.js',
  '**/migrations/**',
  '**/assets/**',
];

const viteCommand = path.join(
  atlasDirectory,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);

let generatorProcess;
let viteProcess;
let watcher;
let debounceTimer;
let generationQueued = false;
let shuttingDown = false;

function timestamp() {
  return new Date().toLocaleTimeString();
}

async function generate(reason) {
  if (shuttingDown) return;

  if (generatorProcess) {
    generationQueued = true;
    return;
  }

  console.log(`[atlas ${timestamp()}] Generating (${reason})…`);
  generatorProcess = spawn(process.execPath, ['scripts/generate-atlas.mjs'], {
    cwd: atlasDirectory,
    stdio: 'inherit',
    shell: false,
  });

  try {
    await new Promise((resolve, reject) => {
      generatorProcess.once('error', reject);
      generatorProcess.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`atlas generation exited with ${code ?? `signal ${signal}`}`));
      });
    });
    console.log(`[atlas ${timestamp()}] Atlas updated.`);
  } catch (error) {
    // A bad edit should be visible without taking down the editor's dev
    // server. The next source change will retry generation.
    console.error(`[atlas ${timestamp()}] Generation failed: ${error.message}`);
  } finally {
    generatorProcess = undefined;
    if (generationQueued && !shuttingDown) {
      generationQueued = false;
      void generate('queued change');
    }
  }
}

function scheduleGeneration(filePath, eventName) {
  if (shuttingDown || path.resolve(filePath) === generatedFile) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    void generate(`${eventName}: ${path.relative(repositoryDirectory, filePath)}`);
  }, debounceMilliseconds);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(debounceTimer);

  if (watcher) await watcher.close().catch(() => {});

  for (const child of [generatorProcess, viteProcess]) {
    if (child && !child.killed) child.kill('SIGTERM');
  }

  // Give child processes a moment to flush inherited output before exiting.
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exitCode = exitCode;
}

async function main() {
  await generate('initial scan');

  watcher = chokidar.watch(sourceGlobs, {
    ignored,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 25 },
  });
  watcher.on('all', (eventName, filePath) => scheduleGeneration(filePath, eventName));
  watcher.on('error', (error) => console.error(`[atlas ${timestamp()}] Watcher error: ${error.message}`));

  viteProcess = spawn(viteCommand, ['--host', '127.0.0.1'], {
    cwd: atlasDirectory,
    stdio: 'inherit',
    shell: false,
  });
  viteProcess.once('error', (error) => {
    console.error(`[atlas ${timestamp()}] Vite failed to start: ${error.message}`);
    void shutdown(1);
  });
  viteProcess.once('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[atlas ${timestamp()}] Vite stopped with ${code ?? `signal ${signal}`}.`);
      void shutdown(code ?? 1);
    }
  });

  console.log(`[atlas ${timestamp()}] Watching source changes. Press Ctrl+C to stop.`);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

main().catch((error) => {
  console.error(`[atlas ${timestamp()}] ${error.stack ?? error.message}`);
  void shutdown(1);
});
