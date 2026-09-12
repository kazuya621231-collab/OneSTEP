import { randomUUID } from 'node:crypto';
import {
  GEMINI_MODEL,
  GeminiServiceError,
  sendMessageToGemini
} from '../src/services/gemini.js';
import { buildReportPrompt, type ReportRequestInput } from '../src/prompts/daily-report.js';

function json(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause instanceof Error
      ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack }
      : error.cause
  };
}

// ブラウザで直接開いた場合も、Functionの配置と環境変数の有無を確認できます。
export function GET(): Response {
  const requestId = randomUUID();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  console.info('[Vercel Function] Gemini endpoint health check', {
    requestId,
    geminiConfigured,
    model: GEMINI_MODEL
  });

  return json({
    ok: true,
    endpoint: '/api/gemini',
    method: 'POST',
    geminiConfigured,
    model: GEMINI_MODEL,
    requestId
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  console.log('[Vercel Function] リクエスト開始', {
    requestId,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    model: GEMINI_MODEL
  });

  try {
    let input: ReportRequestInput;
    try {
      input = await request.json() as ReportRequestInput;
    } catch {
      return json({
        error: '入力データを読み取れませんでした。',
        code: 'INVALID_REQUEST',
        httpStatus: 400,
        geminiMessage: null,
        requestId
      }, 400);
    }

    const prompt = buildReportPrompt(input);
    const reply = await sendMessageToGemini(prompt);

    console.log('[Vercel Function] Gemini通信成功', {
      requestId,
      replyLength: reply.length,
      model: GEMINI_MODEL
    });

    return json({ reply, model: GEMINI_MODEL, requestId });
  } catch (error) {
    const code = error instanceof GeminiServiceError ? error.code : 'UNKNOWN_ERROR';
    const httpStatus = error instanceof GeminiServiceError ? error.httpStatus : null;
    const responseBody = error instanceof GeminiServiceError ? error.responseBody : null;
    const geminiMessage = error instanceof GeminiServiceError ? error.geminiMessage : null;
    const responseStatus = httpStatus && httpStatus >= 400 && httpStatus <= 599
      ? httpStatus
      : 502;

    console.error('[Vercel Function] Gemini通信失敗・完全診断', {
      requestId,
      code,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
      httpStatus,
      geminiResponseBody: responseBody,
      geminiMessage,
      details: getErrorDetails(error),
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      model: GEMINI_MODEL
    });

    return json({
      error: error instanceof Error ? error.message : 'Geminiとの通信に失敗しました。',
      code,
      httpStatus,
      geminiMessage,
      requestId
    }, responseStatus);
  }
}
