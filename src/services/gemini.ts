// モデル変更はこの定数だけで行えるようにします。
export const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export type GeminiErrorCode =
  | 'MISSING_API_KEY'
  | 'GEMINI_HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR';

export interface GeminiErrorOptions extends ErrorOptions {
  httpStatus?: number;
  responseBody?: string;
  geminiMessage?: string;
}

export class GeminiServiceError extends Error {
  readonly code: GeminiErrorCode;
  readonly httpStatus: number | null;
  readonly responseBody: string | null;
  readonly geminiMessage: string | null;

  constructor(code: GeminiErrorCode, message: string, options: GeminiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'GeminiServiceError';
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.responseBody = options.responseBody ?? null;
    this.geminiMessage = options.geminiMessage ?? null;
  }
}

interface GeminiResponsePayload {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

function parseResponseBody(responseBody: string): GeminiResponsePayload | null {
  try {
    return JSON.parse(responseBody) as GeminiResponsePayload;
  } catch {
    return null;
  }
}

function extractReply(payload: GeminiResponsePayload | null): string {
  return payload?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim() || '';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isRetryable(error: unknown): error is GeminiServiceError {
  return error instanceof GeminiServiceError
    && error.httpStatus !== null
    && RETRYABLE_HTTP_STATUSES.has(error.httpStatus);
}

async function requestGemini(message: string, apiKey: string, endpoint: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: message }] }]
    })
  });

  const responseBody = await response.text();
  const payload = parseResponseBody(responseBody);

  if (!response.ok) {
    throw new GeminiServiceError(
      'GEMINI_HTTP_ERROR',
      `Gemini APIがHTTP ${response.status}を返しました。`,
      {
        httpStatus: response.status,
        responseBody,
        geminiMessage: payload?.error?.message || response.statusText
      }
    );
  }

  const reply = extractReply(payload);
  if (!reply) {
    throw new GeminiServiceError(
      'INVALID_RESPONSE',
      'Geminiのレスポンスに返答テキストが含まれていません。',
      {
        httpStatus: response.status,
        responseBody,
        geminiMessage: payload?.error?.message
      }
    );
  }

  return reply;
}

/**
 * Geminiへテキストを送信し、返答本文だけを返します。
 * 生のHTTPレスポンスを記録できるよう、サーバー側のfetchを使用します。
 */
export async function sendMessageToGemini(message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    const error = new GeminiServiceError(
      'MISSING_API_KEY',
      'GEMINI_API_KEYが設定されていません。'
    );
    console.error('[Gemini Service] 設定エラー', {
      message: error.message,
      stack: error.stack,
      httpStatus: error.httpStatus,
      responseBody: error.responseBody
    });
    throw error;
  }

  const endpoint = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  try {
    try {
      const reply = await requestGemini(message, apiKey, endpoint);
      console.info('[Gemini] 成功', { successfulAttempt: 0, totalRequests: 1 });
      return reply;
    } catch (initialError) {
      if (!isRetryable(initialError)) throw initialError;

      let lastError: GeminiServiceError = initialError;
      for (let retryIndex = 0; retryIndex < RETRY_DELAYS_MS.length; retryIndex += 1) {
        const attempt = retryIndex + 1;
        const delayMs = RETRY_DELAYS_MS[retryIndex];
        console.log(`[Gemini Retry] Attempt ${attempt}`, {
          attempt,
          delayMs,
          previousHttpStatus: lastError.httpStatus
        });
        await wait(delayMs);

        try {
          const reply = await requestGemini(message, apiKey, endpoint);
          console.info('[Gemini Retry] 成功', {
            successfulAttempt: attempt,
            totalRequests: attempt + 1
          });
          return reply;
        } catch (retryError) {
          if (!isRetryable(retryError)) throw retryError;
          lastError = retryError;
        }
      }

      console.error('[Gemini Retry] 最終失敗', {
        retries: RETRY_DELAYS_MS.length,
        totalRequests: RETRY_DELAYS_MS.length + 1,
        httpStatus: lastError.httpStatus,
        message: lastError.message,
        geminiMessage: lastError.geminiMessage
      });
      throw lastError;
    }
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      console.error('[Gemini Service] Gemini APIエラー詳細', {
        message: error.message,
        stack: error.stack,
        httpStatus: error.httpStatus,
        responseBody: error.responseBody,
        geminiMessage: error.geminiMessage
      });
      throw error;
    }

    const networkError = new GeminiServiceError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Gemini APIへの接続中に不明なエラーが発生しました。',
      { cause: error }
    );

    console.error('[Gemini Service] ネットワークエラー詳細', {
      message: networkError.message,
      stack: networkError.stack,
      httpStatus: networkError.httpStatus,
      responseBody: networkError.responseBody,
      cause: error
    });
    throw networkError;
  }
}
