import type { HighlightImage } from "@how-money/shared";
import type { z } from "zod";
import type { ResearchEnv } from "./types.js";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicImageContent = {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

export async function callClaudeJson<T>(
  env: ResearchEnv,
  args: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxTokens: number;
    image?: HighlightImage;
  }
): Promise<T | null> {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  const content: Array<AnthropicTextContent | AnthropicImageContent> = [
    { type: "text", text: args.prompt }
  ];
  const image = args.image ? parseImageData(args.image) : null;

  if (image) {
    content.push(image);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as AnthropicResponse;
  const text = data.content?.find((item) => item.type === "text" && item.text)?.text;

  if (!text) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(stripJsonFence(text));
    const parsed = args.schema.safeParse(parsedJson);

    if (!parsed.success) {
      console.error("Claude JSON failed validation", {
        issues: parsed.error.issues,
        raw: text
      });
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error("Claude JSON parse failed", { error, raw: text });
    return null;
  }
}

function parseImageData(image: HighlightImage): AnthropicImageContent | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(image.dataUrl);

  if (!match) {
    return null;
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mimeType || match[1],
      data: match[2]
    }
  };
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}
