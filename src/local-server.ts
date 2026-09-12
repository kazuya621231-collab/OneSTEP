import 'dotenv/config';
import { createReadStream, existsSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { GEMINI_MODEL, GeminiServiceError, sendMessageToGemini } from './services/gemini.js';
import { buildReportPrompt, type ReportRequestInput } from './prompts/daily-report.js';

const PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = process.cwd();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function serveStaticFile(pathname: string, response: ServerResponse): void {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(PROJECT_ROOT, requestedPath));

  if (!filePath.startsWith(PROJECT_ROOT) || !existsSync(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<ReportRequestInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ReportRequestInput;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/gemini' && request.method === 'GET') {
    sendJson(response, 200, {
      ok: true,
      endpoint: '/api/gemini',
      method: 'POST',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      model: GEMINI_MODEL
    });
    return;
  }

  if (url.pathname === '/api/gemini' && request.method === 'POST') {
    const requestId = crypto.randomUUID();
    console.info('[Local API] Gemini request received', { requestId, model: GEMINI_MODEL });

    try {
      const input = await readJsonBody(request);
      const reply = await sendMessageToGemini(buildReportPrompt(input));
      console.info('[Local API] Gemini request succeeded', { requestId, replyLength: reply.length });
      sendJson(response, 200, { reply, model: GEMINI_MODEL, requestId });
    } catch (error) {
      const code = error instanceof GeminiServiceError ? error.code : 'UNKNOWN_ERROR';
      console.error('[Local API] Gemini request failed', { requestId, code, error });
      sendJson(response, 500, { error: 'Geminiとの通信に失敗しました。', code, requestId });
    }
    return;
  }

  if (request.method === 'GET') {
    serveStaticFile(url.pathname, response);
    return;
  }

  response.writeHead(405, { Allow: 'GET, POST' });
  response.end();
});

server.listen(PORT, () => {
  console.log(`OneSTEP: http://localhost:${PORT}`);
});
