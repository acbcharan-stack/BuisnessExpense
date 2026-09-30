import "server-only";

import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";
import { ExtractionError } from "./errors";
import { runWithFailover } from "./failover";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import {
  extractionResultSchema,
  geminiResponseSchema,
  type ExtractionResult,
} from "./schema";

// Routes calling this run with maxDuration = 60s; keep ~20s spare for the
// download and database writes around the AI call.
const MAX_CALL_ATTEMPTS = 4;
const CALL_BUDGET_MS = 40_000;
const MAX_ATTEMPT_MS = 25_000;
const MIN_ATTEMPT_MS = 6_000;

export interface ExtractionOutcome {
  parsed: ExtractionResult;
  rawText: string;
  model: string;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * Sends one document (image or PDF) to Gemini and returns the structured,
 * validated extraction. Transient failures (503 "high demand", 429, timeouts)
 * are retried with backoff and a fallback model inside the call; whatever is
 * finally thrown is classified by `classifyExtractionError` so the caller can
 * record a friendly message and decide whether another attempt is worthwhile.
 */
export async function extractDocument(params: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ExtractionOutcome> {
  const { geminiApiKey, geminiModel, geminiFallbackModel } = getServerEnv();
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const data = toBase64(params.bytes);

  const models = [geminiModel];
  if (geminiFallbackModel.trim() && geminiFallbackModel.trim() !== geminiModel) {
    models.push(geminiFallbackModel.trim());
  }

  const { value: rawText, model } = await runWithFailover({
    models,
    maxAttempts: MAX_CALL_ATTEMPTS,
    budgetMs: CALL_BUDGET_MS,
    minAttemptMs: MIN_ATTEMPT_MS,
    maxAttemptMs: MAX_ATTEMPT_MS,
    call: async (modelName, timeoutMs) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_SYSTEM_PROMPT },
              { inlineData: { mimeType: params.mimeType, data } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseSchema: geminiResponseSchema as any,
          temperature: 0,
          maxOutputTokens: 8192,
          // One HTTP attempt per call: retries are ours, so the time budget holds.
          httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
        },
      });

      const finish = response.candidates?.[0]?.finishReason;
      const text = response.text ?? "";
      if (!text.trim()) {
        throw new ExtractionError(
          "The AI returned an empty answer for this document. Press Retry.",
        );
      }
      if (finish === "MAX_TOKENS") {
        throw new ExtractionError(
          "The AI's answer was cut off (very long document). Press Retry, or enter it manually.",
        );
      }
      return text;
    },
  });

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    // Occasionally the model wraps JSON in ```json fences despite the mime type.
    const fenced = rawText.match(/\{[\s\S]*\}/);
    if (!fenced) throw new ExtractionError("The AI's answer was not in the expected format. Press Retry.");
    try {
      json = JSON.parse(fenced[0]);
    } catch {
      throw new ExtractionError("The AI's answer was not in the expected format. Press Retry.");
    }
  }

  const parsed = extractionResultSchema.parse(json);
  return { parsed, rawText, model };
}
