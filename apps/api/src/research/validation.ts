import type { ResearchInput } from "@how-money/shared";
import { z } from "zod";

const pageSchema = z.object({
  url: z.string().url(),
  title: z.string()
});

const imageSchema = z.object({
  dataUrl: z.string().startsWith("data:"),
  mimeType: z.string().regex(/^image\/(png|jpe?g|webp|gif)$/),
  altText: z.string().optional()
});

const researchInputSchema = z.object({
  selectedText: z.string().optional(),
  image: imageSchema.optional(),
  page: pageSchema
}).superRefine((value, ctx) => {
  const hasText = typeof value.selectedText === "string" && value.selectedText.trim().length >= 2;
  const hasImage = Boolean(value.image);

  if (!hasText && !hasImage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "selectedText must be at least two characters unless an image is provided."
    });
  }
});

export function validateResearchInput(body: unknown):
  | { ok: true; input: ResearchInput }
  | { ok: false; error: string } {
  const parsed = researchInputSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join(" ")
    };
  }

  return {
    ok: true,
    input: {
      selectedText: parsed.data.selectedText?.trim(),
      image: parsed.data.image,
      page: parsed.data.page
    }
  };
}
