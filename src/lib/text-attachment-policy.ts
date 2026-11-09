export const CHATGPT_TEXT_MODEL_ID = "text-gpt-5-4-mini";
export const TEXT_ATTACHMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

export function validateTextAttachmentPolicy(modelConfigId: string, attachmentCount: number, mimeTypes: readonly string[] = []): void {
  if (attachmentCount > 0 && modelConfigId !== CHATGPT_TEXT_MODEL_ID) {
    throw new Error("Вложения в текстовом чате поддерживает только ChatGPT.");
  }
  if (attachmentCount > 1) throw new Error("В одном запросе ChatGPT можно прикрепить один файл.");
  if (mimeTypes.some((mimeType) => !TEXT_ATTACHMENT_MIME_TYPES.includes(mimeType as typeof TEXT_ATTACHMENT_MIME_TYPES[number]))) {
    throw new Error("ChatGPT принимает PDF, JPEG и PNG.");
  }
}
