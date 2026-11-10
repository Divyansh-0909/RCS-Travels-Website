import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './core.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const runtime = path.join(root, 'output/handoff');
export const config = {
  root, runtime, documentId: '1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8',
  folderId: '1mSEZf7o3AiBFdcTe0YSDljVOQSuHwmk5', pollMs: 60_000, port: 4317,
  previewUrl: 'http://127.0.0.1:1574',
  ...readJson(path.join(runtime, 'config.json'), {}),
};
