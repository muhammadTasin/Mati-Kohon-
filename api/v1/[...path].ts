// Vercel serverless entry: every /api/v1/* request goes to the same handler that `npm start` serves locally.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../../services/api/src/server.ts';

export default function api(request: IncomingMessage, response: ServerResponse) {
  return handler(request, response);
}
