// モデル変更はこの定数だけで行えるようにします。
export const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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

/**
 * Geminiへテキストを送信し、返答本文だけを返します。
 * 生のHTTPレスポンスを記録できるよう、サーバー側のfetchを使用します。
 */
export async function sendMessageToGemini(message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  console.log('[Gemini Service] APIリクエスト準備', {
    hasApiKey: Boolean(apiKey),
    model: GEMINI_MODEL,
    requestStart: true
  });

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
    console.log('[Gemini Service] Gemini APIへの送信を開始', {
      hasApiKey: true,
      model: GEMINI_MODEL,
      endpoint
    });

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

    // APIキーや送信ヘッダーは含めず、Geminiから返された内容をすべて記録します。
    console.log('[Gemini Service] Gemini APIレスポンス全文', {
      httpStatus: response.status,
      statusText: response.statusText,
      ok: response.ok,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      responseBody,
      parsedResponse: payload
    });

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
