import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/01a17c1c-0b9e-7ab3-881c-e682b30da283";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Видео — стартовый набор");
sheet.showGridLines = false;
sheet.tabColor = "#395A39";

sheet.getRange("A2:H2").merge();
sheet.getRange("A2").values = [["Модели видео для агрегатора"]];
sheet.getRange("A3:H3").merge();
sheet.getRange("A3").values = [["Цены и параметры — по скриншотам Polza; ориентир для выбора, перед запуском перепроверить в API."]];

const headers = [[
  "Модель", "Цена в Polza", "720p / 4 сек", "Качество", "Длительность", "Формат 3:4", "Роль в агрегаторе", "Звук"
]];
const rows = [
  [
    "Seedance 2 Mini",
    "480p — 3,24 ₽/сек\n720p — 6,75 ₽/сек",
    "27 ₽",
    "480p, 720p",
    "4–15 сек",
    "Да, сразу в модели. Обрезка не нужна.",
    "Основной недорогой вариант для товарных видео.",
    "Да. Можно включать или выключать. По умолчанию — выключить."
  ],
  [
    "Seedance 2",
    "480p — 15,39 ₽/сек\n720p — 33,75 ₽/сек\n1080p — 83,70 ₽/сек",
    "135 ₽",
    "480p, 720p, 1080p",
    "4–15 сек",
    "Да, сразу в модели. Обрезка не нужна.",
    "Качественный вариант, когда Mini не дал нужный результат.",
    "Да. Можно включать или выключать. По умолчанию — выключить."
  ],
  [
    "Alibaba Wan 3.0",
    "22,84 ₽/сек\n5 сек ≈ 114 ₽\n10 сек ≈ 228 ₽",
    "91,36 ₽",
    "480p, 720p, 1080p",
    "2–30 сек",
    "Да, сразу в модели. Обрезка не нужна.",
    "Сильная современная альтернатива Seedance для выразительных роликов.",
    "Да. generate_audio: true/false; в интерфейсе по умолчанию — выключить."
  ],
  [
    "Google Gemini Omni 1.1 Flash",
    "От 48 до 189 ₽/ролик\nзависит от длины и разрешения",
    "Нет данных для 720p\n4K / 4 сек — 111 ₽",
    "360p, 720p, 1080p, 4K",
    "4, 6, 8 или 10 сек",
    "Нет. Генерирует 16:9 или 9:16. Можно привести к 3:4 на нашем сервере через FFmpeg, но часть кадра будет обрезана.",
    "Творческий и сложный вариант: аудио, персонажи, несколько референсов, первый/последний кадр.",
    "Да. Поддерживает генерацию аудио. Включать только если оно действительно нужно."
  ],
];

sheet.getRange("A5:H5").values = headers;
sheet.getRange("A6:H9").values = rows;
sheet.tables.add("A5:H9", true, "VideoModels");

sheet.getRange("A12:H12").merge();
sheet.getRange("A12").values = [["Kling 3.0 — не ставим основным вариантом для маркетплейсов"]];
sheet.getRange("A13:C13").values = [["Модель", "Почему не выбрали для маркетплейса", "Можно вернуться позже"]];
sheet.getRange("A14:C14").values = [[
  "Kling 3.0",
  "Нет 3:4: ролик придётся привести к 3:4 на нашем сервере через FFmpeg — так же, как Omni. Но у Kling статус «возможны проблемы», а для товарного видео он не даёт преимущества перед Seedance/Wan.",
  "Да, как творческую модель для нестандартных сюжетов или Reels."
]];
sheet.tables.add("A13:C14", true, "ExcludedForFormat");

sheet.getRange("A17:H17").merge();
sheet.getRange("A17").values = [["Важно: отсутствие 3:4 не делает модель непригодной: ролик можно обрезать в FFmpeg. Но для карточки товара лучше сначала генерировать 3:4, чтобы не потерять композицию и важные детали."]];

sheet.getRange("A2:H2").format = {
  fill: "#FFFFFF",
  font: { name: "Arial", size: 15, bold: true, color: "#203020" },
  verticalAlignment: "center",
};
sheet.getRange("A3:H3").format = {
  font: { name: "Arial", size: 10, italic: true, color: "#5C6B5C" },
  verticalAlignment: "center",
};
sheet.getRange("A5:H5").format = {
  fill: "#395A39",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#FFFFFF" },
};
sheet.getRange("A6:H9").format = {
  font: { name: "Arial", size: 10, color: "#1F2937" },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#D9E1D9" },
};
sheet.getRange("A6:A9").format.font = { name: "Arial", size: 10, bold: true, color: "#203020" };
sheet.getRange("A13:C13").format = {
  fill: "#F3D9D9",
  font: { name: "Arial", size: 10, bold: true, color: "#7A1E1E" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#FFFFFF" },
};
sheet.getRange("A14:C14").format = {
  font: { name: "Arial", size: 10, color: "#3D2424" },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#E3C5C5" },
};
sheet.getRange("A12:H12").format = {
  fill: "#FFF6E6",
  font: { name: "Arial", size: 11, bold: true, color: "#6B4C13" },
  verticalAlignment: "center",
};
sheet.getRange("A17:H17").format = {
  font: { name: "Arial", size: 10, italic: true, color: "#5C5C5C" },
  verticalAlignment: "center",
  wrapText: true,
};

sheet.getRange("A2:G2").format.rowHeight = 26;
sheet.getRange("A3:G3").format.rowHeight = 22;
sheet.getRange("A5:G5").format.rowHeight = 32;
sheet.getRange("A6:G9").format.rowHeight = 78;
sheet.getRange("A12:G12").format.rowHeight = 24;
sheet.getRange("A13:C13").format.rowHeight = 30;
sheet.getRange("A14:C14").format.rowHeight = 100;
sheet.getRange("A17:G17").format.rowHeight = 30;

const widths = { A: 145, B: 135, C: 110, D: 110, E: 92, F: 215, G: 205, H: 195 };
for (const [col, px] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidthPx = px;

sheet.freezePanes.freezeRows(5);

workbook.recalculate();
const check = await workbook.inspect({ kind: "table", range: "Видео — стартовый набор!A2:H17", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 8 });
console.log(check.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 50 }, summary: "formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Видео — стартовый набор", range: "A2:H17", scale: 1.25, format: "png" });
await fs.writeFile(`${outputDir}/svodka_video_modelei_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/svodka_video_modelei.xlsx`);
