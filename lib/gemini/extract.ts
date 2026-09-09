import "server-only";

import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import {
  extractionResultSchema,
  geminiResponseSchema,
  type ExtractionResult,
} from "./schema";

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
 * validated extraction. Throws on transport / parse failure so the caller can
 * mark the job for retry.
 */
export async function extractDocument(params: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<ExtractionOutcome> {
  const { geminiApiKey, geminiModel } = getServerEnv();
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACTION_SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType: params.mimeType,
              data: toBase64(params.bytes),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: geminiResponseSchema as any,
      temperature: 0,
      maxOutputTokens: 4096,
    },
  });

  const rawText = response.text ?? "";
  if (!rawText.trim()) {
    throw new Error("Gemini returned an empty response");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    // Occasionally the model wraps JSON in ```json fences despite the mime type.
    const fenced = rawText.match(/\{[\s\S]*\}/);
    if (!fenced) throw new Error("Gemini response was not valid JSON");
    json = JSON.parse(fenced[0]);
  }

  const parsed = extractionResultSchema.parse(json);
  return { parsed, rawText, model: geminiModel };
}
