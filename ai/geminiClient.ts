import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const DEFAULT_MODEL = 'gemini-4-hydrogen';

function getModelName(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_MODEL;
}

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class GeminiClientError extends Error {
  code: 'NO_API_KEY' | 'TIMEOUT' | 'INVALID_JSON' | 'API_ERROR';
  constructor(message: string, code: 'NO_API_KEY' | 'TIMEOUT' | 'INVALID_JSON' | 'API_ERROR') {
    super(message);
    this.name = 'GeminiClientError';
    this.code = code;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new GeminiClientError(`AI request timed out after ${timeoutMs}ms`, 'TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generateStructuredJson<T>(params: {
  prompt: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  timeoutMs?: number;
  simulateError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<T> {
  if (params.simulateError === 'timeout') {
    throw new GeminiClientError('AI response timed out. Your game session is safely preserved.', 'TIMEOUT');
  }
  if (params.simulateError === 'invalid_json') {
    throw new GeminiClientError('AI returned an invalid structured payload. Please retry.', 'INVALID_JSON');
  }
  if (params.simulateError === 'api_error') {
    throw new GeminiClientError('AI service temporarily unavailable. Please retry.', 'API_ERROR');
  }

  const ai = getClient();
  if (!ai) {
    throw new GeminiClientError('Gemini API key is not configured on the server.', 'NO_API_KEY');
  }

  const model = getModelName();
  const timeoutMs = params.timeoutMs ?? 6500;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.prompt,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema as any,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        timeoutMs
      );

      const raw = (response.text ?? '').trim();
      if (!raw) {
        throw new GeminiClientError('Empty response from Gemini.', 'INVALID_JSON');
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new GeminiClientError('Gemini returned malformed JSON.', 'INVALID_JSON');
      }
    } catch (err: any) {
      lastError = err;
      if (err instanceof GeminiClientError && err.code === 'NO_API_KEY') {
        throw err;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  if (lastError instanceof GeminiClientError) {
    throw lastError;
  }
  throw new GeminiClientError(
    lastError instanceof Error ? lastError.message : 'Gemini request failed',
    'API_ERROR'
  );
}

export interface GroundedTextResult {
  text: string;
  sources: Array<{ title: string; uri: string }>;
}

export async function generateGroundedContent(params: {
  prompt: string;
  systemInstruction: string;
  timeoutMs?: number;
}): Promise<GroundedTextResult> {
  const ai = getClient();
  if (!ai) {
    throw new GeminiClientError('Gemini API key is not configured on the server.', 'NO_API_KEY');
  }
  const model = getModelName();
  const timeoutMs = params.timeoutMs ?? 12000;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.prompt,
          config: {
            systemInstruction: params.systemInstruction,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        timeoutMs
      );

      const text = (response.text ?? '').trim();
      const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{
        web?: { uri?: string; title?: string };
      }>;
      const sources = chunks
        .filter((c) => c.web?.uri)
        .map((c) => ({
          title: c.web?.title || 'Reference Source',
          uri: c.web!.uri!,
        }))
        .slice(0, 4);

      if (!text) {
        throw new GeminiClientError('Empty grounded response.', 'INVALID_JSON');
      }
      return { text, sources };
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  if (lastError instanceof GeminiClientError) throw lastError;
  throw new GeminiClientError(
    lastError instanceof Error ? lastError.message : 'Grounded search failed',
    'API_ERROR'
  );
}

// 1. Word a server-selected attribute into a natural question + 2-4 tappable options
export async function wordQuestionWithGemini(params: {
  category: string;
  industry: string | null;
  attributeKey: string;
  allowedValues: Array<{ value: string; label: string }>;
  questionIndex: number;
  fallbackQuestion: string;
  simulateError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<{ attributeKey: string; question: string; options: Array<{ value: string; label: string }> }> {
  const schema = {
    type: Type.OBJECT,
    properties: {
      attributeKey: { type: Type.STRING },
      question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.STRING },
            label: { type: Type.STRING },
          },
          required: ['value', 'label'],
        },
      },
    },
    required: ['attributeKey', 'question', 'options'],
  };

  const result = await generateStructuredJson<{
    attributeKey: string;
    question: string;
    options: Array<{ value: string; label: string }>;
  }>({
    systemInstruction:
      'You are wording a crisp, natural, engaging question for MINDMYSTERY, a mind-reading deduction game. Never invent new attributes or change option values. Return concise 1-sentence questions (under 14 words) and keep exact option value keys.',
    prompt: JSON.stringify({
      category: params.category,
      industry: params.industry,
      questionNumber: params.questionIndex,
      attributeKey: params.attributeKey,
      referenceQuestion: params.fallbackQuestion,
      allowedOptions: params.allowedValues,
      rule: 'Return the exact attributeKey and exact option value strings. Only polish question phrasing and short tappable labels (1-4 words each).',
    }),
    responseSchema: schema,
    timeoutMs: 4200,
    simulateError: params.simulateError,
  });

  // Strict server-side validation: reject mismatched attributeKey or invalid values
  if (result.attributeKey !== params.attributeKey || !result.question?.trim()) {
    throw new GeminiClientError('Gemini returned disallowed attributeKey', 'INVALID_JSON');
  }
  const allowedSet = new Set(params.allowedValues.map((v) => v.value));
  const validOptions = (result.options ?? []).filter((o) => allowedSet.has(o.value) && o.label?.trim());
  if (validOptions.length !== params.allowedValues.length) {
    throw new GeminiClientError('Gemini returned incomplete option set', 'INVALID_JSON');
  }

  return {
    attributeKey: params.attributeKey,
    question: result.question.trim(),
    options: validOptions.map((o) => ({ value: o.value, label: o.label.trim() })),
  };
}

// 2. Convert a user's free-text clue into structured attribute filters + keyword tags
export async function parseClueWithGemini(params: {
  category: string;
  industry: string | null;
  clueText: string;
  availableAttributes: Record<string, string[]>;
  simulateError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<{
  filters: Array<{ attributeKey: string; value: string }>;
  keywords: string[];
}> {
  const schema = {
    type: Type.OBJECT,
    properties: {
      filters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            attributeKey: { type: Type.STRING },
            value: { type: Type.STRING },
          },
          required: ['attributeKey', 'value'],
        },
      },
      keywords: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ['filters', 'keywords'],
  };

  const result = await generateStructuredJson<{
    filters: Array<{ attributeKey: string; value: string }>;
    keywords: string[];
  }>({
    systemInstruction:
      'Convert the user free-text clue into structured attribute filters using ONLY the allowed attribute keys and allowed values provided. Also extract 2-5 concise lowercase search keywords from the clue.',
    prompt: JSON.stringify({
      category: params.category,
      industry: params.industry,
      clue: params.clueText,
      allowedAttributesAndValues: params.availableAttributes,
    }),
    responseSchema: schema,
    timeoutMs: 6000,
    simulateError: params.simulateError,
  });

  // Strict server validation against allowed attributes and values
  const validatedFilters = (result.filters ?? []).filter((f) => {
    const allowed = params.availableAttributes[f.attributeKey];
    return Array.isArray(allowed) && allowed.includes(String(f.value));
  });

  const keywords = (result.keywords ?? [])
    .map((k) => String(k).toLowerCase().trim())
    .filter((k) => k.length >= 2)
    .slice(0, 6);

  return { filters: validatedFilters, keywords };
}

// 3. Write an honest, 2-sentence reveal explanation citing the user's real answers
export async function writeRevealExplanationWithGemini(params: {
  category: string;
  industry: string | null;
  topName: string;
  topSubtitle: string;
  releaseYear: number | null;
  decade: string | null;
  confidencePct: number;
  confidenceLabel: string;
  runnersUpNames: string[];
  answersSummary: Array<{ question: string; answer: string }>;
  isDeterministic: boolean;
  simulateError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<string> {
  const schema = {
    type: Type.OBJECT,
    properties: {
      explanation: { type: Type.STRING },
    },
    required: ['explanation'],
  };

  const result = await generateStructuredJson<{ explanation: string }>({
    systemInstruction:
      'Write a crisp, honest 2-sentence explanation for MINDMYSTERY citing the user actual answers. Never claim supernatural mind reading or false certainty. If confidence is under 65%, openly mention the close runners-up. If deterministic (Number/Date of Birth/Alphabet/Colour), clearly note it was logically deduced from their answers.',
    prompt: JSON.stringify(params),
    responseSchema: schema,
    timeoutMs: 5500,
    simulateError: params.simulateError,
  });

  if (!result.explanation?.trim()) {
    throw new GeminiClientError('Empty explanation from Gemini.', 'INVALID_JSON');
  }
  return result.explanation.trim();
}

export { Type };
