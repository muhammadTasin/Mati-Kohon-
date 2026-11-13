// Vercel serverless entry: vercel.json rewrites every /api/v1/* request here, at any depth, and the handler routes on
// the original path, exactly as `npm start` serves it locally. (A `[...path].ts` catch-all file only matched one
// segment on Vercel, so /api/v1/auth/config and every other nested route returned Vercel's NOT_FOUND.)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../services/api/src/server.ts';

export default function api(request: IncomingMessage, response: ServerResponse) {
  return handler(request, response);
}
