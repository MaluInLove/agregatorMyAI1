import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const outputDir = "outputs/stage0-final-matrix";
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Матрица тестов");
sheet.showGridLines = false;

const imageRows = [
  ["Nano Banana 2.1 / mie", 3, 3, 4.5, 4.5, "Черновик и основной товарный кадр"],
  ["GPT Image 2.5 Sunburst / mie", 4, 4, 7, 7, "Основной товарный кадр и редактура"],
  ["Gemini 3 Pro Image Preview / mie", 13.5, 13.5, 13.5, 13.5, "Сложные сцены и референсы"],
];
const videoRows = [
  ["Seedance 2 Mini / mie", 27.675, 44.28, "Доступная модель"],
  ["Seedance 2 / mie", 138.375, 221.4, "Качественная модель"],
  ["Wan 3.0 / Alibaba", 115.077, 184.123, "Альтернативная модель"],
];
const textRows = [
  ["DeepSeek V4 Flash / gmicloud/fp8", 0.019, 0.048, 0.096],
  ["GPT-5.4 Mini / openai/flex", 0.15, 0.344, 0.687],
  ["Gemini 3.8 Flash / google-ai-studio/flex", 0.132, 0.308, 0.617],
];

sheet.getRange("A2:F2").merge(); sheet.getRange("A2").values = [["Итоговая матрица контрольных тестов Polza"]];
sheet.getRange("A3:F3").merge(); sheet.getRange("A3").values = [["Текущий запуск: обычные пресеты. Премиум (4K, 1080p, 12 секунд) отложен до запуска агрегатора на первых учениках."]];
sheet.getRange("A5:F5").merge(); sheet.getRange("A5").values = [["Изображения — 1K/2K, 3:4 и 1:1"]];
sheet.getRange("A6:F6").values = [["Модель / провайдер", "1K 3:4, ₽", "1K 1:1, ₽", "2K 3:4, ₽", "2K 1:1, ₽", "Назначение"]];
sheet.getRange("A7:F9").values = imageRows;
sheet.getRange("A10:E10").merge(); sheet.getRange("A10").values = [["Итого изображений: 12 тестов"]]; sheet.getRange("F10").formulas = [["=SUM(B7:E9)"]];
sheet.getRange("A12:E12").merge(); sheet.getRange("A12").values = [["Видео для WB и Ozon — 3:4, 720p, без звука"]];
sheet.getRange("A13:D13").values = [["Модель / провайдер", "5 секунд, ₽", "8 секунд, ₽", "Назначение"]];
sheet.getRange("A14:D16").values = videoRows;
sheet.getRange("A17:C17").merge(); sheet.getRange("A17").values = [["Итого видео: 6 тестов"]]; sheet.getRange("D17").formulas = [["=SUM(B14:C16)"]];
sheet.getRange("A19:D19").merge(); sheet.getRange("A19").values = [["Тексты — ориентир цены по опубликованному тарифу"]];
sheet.getRange("A20:D20").values = [["Модель / провайдер", "Быстро: 4 000 симв. / 400 токенов, ₽", "Карточка: 12 000 / 800, ₽", "Разбор: 24 000 / 1 600, ₽"]];
sheet.getRange("A21:D23").values = textRows;
sheet.getRange("A24:C24").merge(); sheet.getRange("A24").values = [["Итого текстов: 9 тестов"]]; sheet.getRange("D24").formulas = [["=SUM(B21:D23)"]];
sheet.getRange("A26:D26").merge(); sheet.getRange("A26").values = [["Сводный бюджет текущего запуска"]];
sheet.getRange("A27:C27").values = [["Блок", "Число тестов", "Ориентир, ₽"]];
sheet.getRange("A28:C30").values = [["Обычные изображения", 12, null], ["Видео 720p, 5/8 секунд", 6, null], ["Тексты", 9, null]];
sheet.getRange("C28").formulas = [["=F10"]]; sheet.getRange("C29").formulas = [["=D17"]]; sheet.getRange("C30").formulas = [["=D24"]];
sheet.getRange("A31:B31").merge(); sheet.getRange("A31").values = [["Итого опубликованных тарифов"]]; sheet.getRange("C31").formulas = [["=SUM(C28:C30)"]];
sheet.getRange("A32:B32").merge(); sheet.getRange("A32").values = [["Рекомендуемый жёсткий бюджет"]]; sheet.getRange("C32").values = [[900]];
sheet.getRange("A34:F34").merge(); sheet.getRange("A34").values = [["Важно: Gemini 3.8 Flash использует reasoning; фактическая цена может быть выше расчётного ориентира. До запуска тестов не создаются платные запросы."]];

for (const range of ["A5:F5", "A12:F12", "A19:D19", "A26:D26"]) sheet.getRange(range).format = { fill: "#DCE6F1", font: { name: "Arial", size: 10, bold: true, color: "#1F2937" } };
for (const range of ["A6:F6", "A13:D13", "A20:D20", "A27:C27"]) sheet.getRange(range).format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
sheet.getRange("A2:F2").format = { font: { name: "Arial", size: 15, bold: true, color: "#1F2937" } };
sheet.getRange("A3:F3").format = { font: { name: "Arial", size: 10, italic: true, color: "#4B5563" }, wrapText: true };
sheet.getRange("A6:F10").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
sheet.getRange("A13:D17").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
sheet.getRange("A20:D24").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
sheet.getRange("A27:C32").format.borders = { preset: "all", style: "thin", color: "#9FBAD0" };
sheet.getRange("A31:C32").format = { fill: "#EAF2F8", font: { name: "Arial", size: 10, bold: true, color: "#1F2937" }, borders: { preset: "all", style: "thin", color: "#9FBAD0" } };
for (const range of ["B7:E10", "B14:C17", "B21:D24", "C28:C32"]) sheet.getRange(range).format.numberFormat = "#,##0.000";
sheet.getRange("A34:F34").format = { font: { name: "Arial", size: 9, italic: true, color: "#4B5563" }, wrapText: true };
sheet.getRange("A:F").format.font = { name: "Arial", size: 10, color: "#1F2937" };
for (const [column, width] of [["A",37],["B",19],["C",19],["D",19],["E",19],["F",34]]) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
sheet.getRange("A2:F34").format.autofitRows(); sheet.freezePanes.freezeRows(6);
workbook.recalculate();
const check = await workbook.inspect({ kind: "table", range: "Матрица тестов!A2:F34", include: "values,formulas", tableMaxRows: 34, tableMaxCols: 6 });
if (!check.ndjson.includes("900")) throw new Error("Не удалось проверить сводный бюджет.");
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Матрица тестов", range: "A2:F34", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook); await output.save(`${outputDir}/matrix.xlsx`);
