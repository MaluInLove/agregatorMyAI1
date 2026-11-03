/** Approved initial tariff matrix. Values are immutable once copied into a job snapshot. */
export const INITIAL_TARIFFS = [
  ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-nano-banana-2-1", parameters: { image_resolution, aspect_ratio: "3:4", output_format: "jpeg" }, creditPrice: image_resolution === "1K" ? 4 : 6, maxExternalCost: image_resolution === "1K" ? 4 : 6 })),
  ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-gpt-image-sunburst", parameters: { image_resolution, aspect_ratio: "3:4", output_format: "jpeg" }, creditPrice: image_resolution === "1K" ? 5 : 9, maxExternalCost: image_resolution === "1K" ? 5 : 9 })),
  ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-nano-banana-pro", parameters: { image_resolution, aspect_ratio: "3:4", output_format: "jpeg" }, creditPrice: 16, maxExternalCost: 16 })),
  ...["1:1"].flatMap((aspect_ratio) => [
    ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-nano-banana-2-1", parameters: { image_resolution, aspect_ratio, output_format: "jpeg" }, creditPrice: image_resolution === "1K" ? 4 : 6, maxExternalCost: image_resolution === "1K" ? 4 : 6 })),
    ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-gpt-image-sunburst", parameters: { image_resolution, aspect_ratio, output_format: "jpeg" }, creditPrice: image_resolution === "1K" ? 5 : 9, maxExternalCost: image_resolution === "1K" ? 5 : 9 })),
    ...["1K", "2K"].map((image_resolution) => ({ modelConfigId: "image-nano-banana-pro", parameters: { image_resolution, aspect_ratio, output_format: "jpeg" }, creditPrice: 16, maxExternalCost: 16 })),
  ]),
  { modelConfigId: "video-seedance-2-mini", parameters: { duration: "5", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 35, maxExternalCost: 35 },
  { modelConfigId: "video-seedance-2-mini", parameters: { duration: "8", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 55, maxExternalCost: 55 },
  { modelConfigId: "video-seedance-2", parameters: { duration: "5", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 165, maxExternalCost: 165 },
  { modelConfigId: "video-seedance-2", parameters: { duration: "8", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 265, maxExternalCost: 265 },
  { modelConfigId: "video-wan-3", parameters: { duration: "5", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 190, maxExternalCost: 190 },
  { modelConfigId: "video-wan-3", parameters: { duration: "8", resolution: "720p", aspect_ratio: "3:4", generate_audio: false }, creditPrice: 190, maxExternalCost: 190 },
  { modelConfigId: "text-deepseek-v4-flash", parameters: { maxOutputTokens: 400 }, creditPrice: 0, maxExternalCost: 0.08 },
  { modelConfigId: "text-gpt-5-4-mini", parameters: { maxOutputTokens: 1600 }, creditPrice: 1, maxExternalCost: 1 },
  { modelConfigId: "text-gemini-flash", parameters: { maxOutputTokens: 1600 }, creditPrice: 2, maxExternalCost: 2 },
] as const;

export const INITIAL_ACCESS_SETTINGS = { startingCredits: 1000, extensionCredits: 500, accessDays: 30, freeDeepSeek: { totalMessages: 250, dailyMessages: 20, maxExternalBudgetRub: 20, perRequestCeilingRub: 0.08 } } as const;
