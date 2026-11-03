import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/МоЯ/ОБуЧЕНИЕ/ВайбСубмарина/АГРегатор/outputs/01a17c1c-0b9e-7ab3-881c-e682b30da283";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Модели изображений");
sheet.showGridLines = false;

const title = "Сводка моделей Polza для агрегатора";
const note = "Статусы и цены зафиксированы по предоставленным скриншотам. 3:4 — вертикальный формат (ширина:высота), подходящий для карточек Wildberries и Ozon. Цены у провайдеров с тарификацией за 1M токенов требуют тестового замера.";

sheet.mergeCells("A1:H1");
sheet.getRange("A1").values = [[title]];
sheet.mergeCells("A2:H2");
sheet.getRange("A2").values = [[note]];

const headers = [[
  "Модель",
  "2K",
  "4K",
  "Исходные фото (≥5)",
  "Формат 3:4 для WB/Ozon",
  "Провайдеры и статус на скриншоте",
  "Цена 2K, ₽",
  "Рекомендация"
]];
sheet.getRange("A4:H4").values = headers;

const rows = [
  [
    "Google Gemini 2.5 Flash Image (Nano Banana)",
    "Нет",
    "Нет",
    "Да, до 8",
    "Да",
    "mie — работает, 99,66%\nbananalab — неофициальный, нет данных\ngoogle-vertex/global — мало запросов",
    "Нет 2K",
    "Основной: mie"
  ],
  [
    "Google Nano Banana 2 (Gemini 3.1 Flash Image Preview)",
    "Да",
    "Да",
    "Да, до 14",
    "Да",
    "mie — работает, 98,14%\nbananalab — неофициальный, нет данных\ngoogle-ai-studio — работает, 99,44%",
    "7,20",
    "Основной: mie; AI Studio — резерв"
  ],
  [
    "Google Nano Banana 2 (Gemini 3.1 Flash Image)",
    "Да",
    "Да",
    "Да, до 14",
    "Да",
    "google-vertex/global — работает, 97,98%\ngoogle-ai-studio — нет запросов",
    "По факту (за токены)",
    "Тестировать цену 2K перед включением"
  ],
  [
    "Google Nano Banana 2.1",
    "Да",
    "Да",
    "Да, до 10",
    "Да",
    "mie — возможны сбои, 93,13%\ngoogle-ai-studio — не отвечает, 51,32%\nbananalab — работает, 100%, но неофициальный",
    "4,50",
    "Резерв: bananalab после теста; mie не использовать как основной"
  ],
  [
    "Google Nano Banana Pro (Gemini 3 Pro Image Preview)",
    "Да",
    "Да",
    "Да, до 8",
    "Да",
    "mie — работает, 97,42%\nbananalab — не отвечает, 17,5%\ngoogle-ai-studio/global — нет запросов\ngoogle-ai-studio/global/flex — работает, 99,36%",
    "13,50",
    "Основной: mie; global/flex — резерв после замера цены"
  ],
  [
    "GPT Image 2.5 Sunburst",
    "Да",
    "Да",
    "Да, до 16",
    "Да",
    "mie — работает, 95,86%",
    "7,00",
    "Использовать с мониторингом"
  ],
  [
    "GPT Image 2.5 Flare",
    "Да",
    "Да",
    "Да, до 16",
    "Да",
    "mie — работает, 94,04%",
    "7,00",
    "Использовать с мониторингом"
  ],
  [
    "OpenAI GPT-5.4 Image 2",
    "Да",
    "Да",
    "Да, до 16",
    "Да",
    "mie — возможны сбои, 85,92%\nopenai — работает, 100%",
    "По факту (openai, за токены)",
    "Основной: openai; mie не использовать"
  ]
];
sheet.getRange(`A5:H${4 + rows.length}`).values = rows;

const all = sheet.getRange(`A1:H${4 + rows.length}`);
all.format.font = { name: "Arial", size: 10, color: "#1F2937" };
all.format.verticalAlignment = "center";

sheet.getRange("A1:H1").format = {
  font: { name: "Arial", size: 15, bold: true, color: "#111827" },
  horizontalAlignment: "left",
  verticalAlignment: "center"
};
sheet.getRange("A1:H1").format.rowHeight = 28;
sheet.getRange("A2:H2").format = {
  font: { name: "Arial", size: 9, italic: true, color: "#4B5563" },
  wrapText: true,
  verticalAlignment: "center"
};
sheet.getRange("A2:H2").format.rowHeight = 42;
sheet.getRange("A4:H4").format = {
  fill: "#1F4E78",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#D9E2F3" }
};
sheet.getRange("A4:H4").format.rowHeight = 34;

sheet.getRange(`A5:H${4 + rows.length}`).format.wrapText = true;
sheet.getRange(`A5:H${4 + rows.length}`).format.borders = { preset: "inside", style: "thin", color: "#D9E2F3" };
sheet.getRange(`A5:H${4 + rows.length}`).format.rowHeight = 62;
sheet.getRange(`A5:A${4 + rows.length}`).format.font = { name: "Arial", size: 10, bold: true, color: "#1F2937" };
sheet.getRange(`B5:E${4 + rows.length}`).format.horizontalAlignment = "center";
sheet.getRange(`G5:G${4 + rows.length}`).format.horizontalAlignment = "center";

const widths = [250, 58, 58, 112, 120, 260, 110, 230];
for (let col = 0; col < widths.length; col += 1) {
  sheet.getRangeByIndexes(0, col, 1, 1).format.columnWidthPx = widths[col];
}

sheet.getRange(`B5:E${4 + rows.length}`).conditionalFormats.add("containsText", {
  text: "Да",
  format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } }
});
sheet.getRange(`B5:E${4 + rows.length}`).conditionalFormats.add("containsText", {
  text: "Нет",
  format: { fill: "#FEE2E2", font: { color: "#991B1B", bold: true } }
});

sheet.freezePanes.freezeRows(4);
sheet.freezePanes.freezeColumns(1);
workbook.recalculate();

const check = await workbook.inspect({
  kind: "table",
  range: `Модели изображений!A1:H${4 + rows.length}`,
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 8
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan"
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Модели изображений",
  range: `A1:H${4 + rows.length}`,
  scale: 1,
  format: "png"
});
await fs.writeFile(`${outputDir}/model-table-preview.png`, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/svodka_modelei_polza.xlsx`);
