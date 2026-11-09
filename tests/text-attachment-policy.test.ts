import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { storeReference } from "../src/lib/reference-storage.ts";
import { CHATGPT_TEXT_MODEL_ID, validateTextAttachmentPolicy } from "../src/lib/text-attachment-policy.ts";

test("вложения текста доступны только ChatGPT и строго по одному", () => {
  assert.throws(() => validateTextAttachmentPolicy("text-deepseek-v4-flash", 1), /только ChatGPT/);
  assert.throws(() => validateTextAttachmentPolicy("text-gemini-flash", 1), /только ChatGPT/);
  assert.throws(() => validateTextAttachmentPolicy(CHATGPT_TEXT_MODEL_ID, 2), /один файл/);
  assert.doesNotThrow(() => validateTextAttachmentPolicy(CHATGPT_TEXT_MODEL_ID, 1, ["application/pdf"]));
  assert.doesNotThrow(() => validateTextAttachmentPolicy(CHATGPT_TEXT_MODEL_ID, 1, ["image/png"]));
  assert.doesNotThrow(() => validateTextAttachmentPolicy(CHATGPT_TEXT_MODEL_ID, 1, ["image/jpeg"]));
  assert.throws(() => validateTextAttachmentPolicy(CHATGPT_TEXT_MODEL_ID, 1, ["image/webp"]), /PDF, JPEG и PNG/);
});

test("файл больше 10 МБ и PDF более десяти страниц отклоняются до сохранения", async () => {
  await assert.rejects(
    storeReference({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), filename: "large.png", mimeType: "image/png" }),
    /до 10 МБ/,
  );
  const pdf = await PDFDocument.create();
  for (let page = 0; page < 11; page += 1) pdf.addPage();
  await assert.rejects(
    storeReference({ buffer: Buffer.from(await pdf.save()), filename: "eleven-pages.pdf", mimeType: "application/pdf" }),
    /до 10 страниц/,
  );
});
