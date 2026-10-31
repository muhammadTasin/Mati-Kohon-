// Builds Rongu's meshes off the main thread, so the page never stutters while he is sculpted.
import { buildRongu } from './rongu-shapes.js';

self.onmessage = event => {
  const { quality = 1 } = event.data || {};
  const parts = buildRongu(quality);
  const transfer = [];
  for (const part of Object.values(parts)) {
    for (const value of Object.values(part)) if (ArrayBuffer.isView(value)) transfer.push(value.buffer);
  }
  self.postMessage({ parts }, transfer);
};
