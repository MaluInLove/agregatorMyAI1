import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outputDir = "outputs/stage0-results";
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Результаты этапа 0");
sheet.showGridLines = false;

const rows = [
  ["Текст", "DeepSeek V4 Flash", "deepseek/deepseek-v4-flash", "gmicloud/fp8", "16 токенов", "Готово", 0.00018477, "Ответ: ОК", "Подтверждено"],
  ["Текст", "GPT-5.4 Mini", "openai/gpt-5.4-mini", "openai/flex", "16 токенов", "Готово", 0.00222516, "Ответ: ОК", "Подтверждено"],
  ["Текст", "Gemini 3.8 Flash (предыдущий провайдер)", "google/gemini-3.8-flash", "google-vertex/global/flex", "16 токенов", "Ошибка Polza", 0, "Две попытки failed, расход 0 ₽; ERR_CANCELED", "Не использовать провайдера"],
  ["Текст", "Gemini 3.8 Flash (рабочий провайдер)", "google/gemini-3.8-flash", "google-ai-studio/flex", "Короткий запрос, до 16 токенов", "Готово", 0.02429904, "Ответ: ОК", "Подтверждено"],
  ["Изображение", "Nano Banana 2.1", "google/gemini-nano-banana-2.1", "mie", "1 шт., 1024×1024", "Готово", 3, "JPEG URL получен", "Подтверждено"],
  ["Изображение", "Nano Banana Pro", "google/gemini-3-pro-image-preview", "mie", "1 шт., 1024×1024", "Готово", 13.5, "JPEG URL получен", "Подтверждено"],
  ["Изображение", "GPT Image 2.5 Sunburst", "openai/gpt-image-2.5-sunburst", "mie", "1 шт., 1024×1024", "Готово", 4, "JPEG URL получен; подтверждено выгрузкой Polza", "Подтверждено"],
  ["Видео", "Seedance 2 Mini", "bytedance/seedance-2-mini", "mie", "5 с, 480p, 3:4", "Готово", 12.825, "WB-файл 810×1080 H.264 создан", "Подтверждено"],
  ["Видео", "Seedance 2", "bytedance/seedance-2", "mie", "4 с, 720p, 3:4", "Готово", 110.7, "WB-файл 810×1080 H.264 создан", "Подтверждено"],
  ["Видео", "Wan 3.0", "alibaba/wan-3.0", "Alibaba", "2 с, 720p, 3:4", "Готово", 47.9405916, "WB-файл 810×1080 H.264 создан", "Подтверждено"],
  ["Видео", "Gemini Omni 1.1 Flash", "google/gemini-omni-1.1-flash", "mie", "4 с, 720p, 9:16", "Готово", 48, "MP4 URL получен", "Подтверждено"],
  ["Видео", "Seedance 2 Mini", "bytedance/seedance-2-mini", "mie", "5 с, 480p, 3:4", "Готово", 12.825, "Автоматически: очередь → Polza → загрузка → WB 810×1080 H.264 → история", "Подтверждено"],
];

sheet.getRange("A2:I2").merge();
sheet.getRange("A2").values = [["Реальные тесты Polza — этап 0"]];
sheet.getRange("A3:I3").merge();
sheet.getRange("A3").values = [["Фактические расходы указаны только там, где ответ API был получен и сохранён."]];
sheet.getRange("A5:I5").values = [["Тип", "Модель", "Технический ID", "Провайдер", "Параметры теста", "Статус", "Стоимость, ₽", "Результат", "Итог"]];
sheet.getRange("A6:I17").values = rows;
sheet.getRange("F19").values = [["Подтверждённый расход, ₽"]];
sheet.getRange("G19").formulas = [["=SUM(G6:G17)"]];
sheet.getRange("F20").values = [["Лимит тестов, ₽"]];
sheet.getRange("G20").values = [[500]];
sheet.getRange("F21").values = [["Остаток по подтверждённым расходам, ₽"]];
sheet.getRange("G21").formulas = [["=G20-G19"]];
sheet.getRange("A23:I23").merge();
sheet.getRange("A23").values = [["Источники: реальные ответы API Polza и локальные файлы var/storage/results; каталог и документация: https://polza.ai/docs"]];

sheet.getRange("A2:I2").format = { font: { name: "Arial", size: 14, bold: true, color: "#1F2937" } };
sheet.getRange("A3:I3").format = { font: { name: "Arial", size: 10, italic: true, color: "#4B5563" } };
sheet.getRange("A5:I5").format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
sheet.getRange("A6:I17").format = { font: { name: "Arial", size: 10, color: "#1F2937" }, verticalAlignment: "center", wrapText: true };
sheet.getRange("A5:I17").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
sheet.getRange("G6:G21").format.numberFormat = "#,##0.000000";
sheet.getRange("F19:G21").format = { fill: "#EAF2F8", font: { name: "Arial", size: 10, bold: true, color: "#1F2937" }, borders: { preset: "all", style: "thin", color: "#9FBAD0" } };
sheet.getRange("A23:I23").format = { font: { name: "Arial", size: 9, italic: true, color: "#4B5563" } };
sheet.getRange("I6:I17").conditionalFormats.add("containsText", { text: "Подтверждено", format: { fill: "#E2F0D9", font: { color: "#276749", bold: true } } });
sheet.getRange("I6:I17").conditionalFormats.add("containsText", { text: "Требует", format: { fill: "#FFF2CC", font: { color: "#9C6500", bold: true } } });
sheet.getRange("A5:I17").format.autofitColumns();
for (const [column, width] of [["A",14],["B",26],["C",36],["D",24],["E",22],["F",45],["G",15],["H",42],["I",20]]) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
sheet.getRange("A5:I17").format.autofitRows();
sheet.freezePanes.freezeRows(5);
workbook.recalculate();
const preview = await workbook.render({ sheetName: "Результаты этапа 0", range: "A1:I23", scale: 1.4, format: "png" });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/results.xlsx`);
