import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require("../.artifact-node-modules/pdf-lib");
const { createCanvas } = require("../.artifact-node-modules/@napi-rs/canvas");
const output = join(process.cwd(), "tmp", "pdfs");

async function saveTextPdf(filename, title, lines, table = null) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText(title, { x: 56, y: 778, size: 18, font: bold, color: rgb(.13, .16, .11) });
  let y = 730;
  for (const line of lines) { page.drawText(line, { x: 56, y, size: 11, font: regular, color: rgb(.13, .13, .13) }); y -= 24; }
  if (table) {
    const widths = [120, 110, 110, 145];
    let tableY = y - 16;
    for (let row = 0; row < table.length; row += 1) {
      let x = 56;
      for (let column = 0; column < table[row].length; column += 1) {
        page.drawRectangle({ x, y: tableY - 22, width: widths[column], height: 28, borderWidth: .5, borderColor: rgb(.48, .56, .38), color: row === 0 ? rgb(.91, .95, .84) : rgb(1, 1, 1) });
        page.drawText(table[row][column], { x: x + 5, y: tableY - 12, size: 8, font: row === 0 ? bold : regular, color: rgb(.13, .13, .13) });
        x += widths[column];
      }
      tableY -= 28;
    }
  }
  await writeFile(join(output, filename), await pdf.save());
}

async function saveScanPdf() {
  const canvas = createCanvas(1240, 1754);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f2e7";
  context.fillRect(0, 0, 1240, 1754);
  context.fillStyle = "#202020";
  context.font = "bold 40px Arial";
  context.fillText("Control scanned PDF", 86, 150);
  context.font = "28px Arial";
  ["This page is a raster image, not selectable text.", "Task: read the text and write a short summary.", "Product: a soft cotton everyday t-shirt.", "We check recognition of a scanned document."].forEach((line, index) => context.fillText(line, 86, 270 + index * 76));
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(await canvas.encode("png"));
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  await writeFile(join(output, "03-scan.pdf"), await pdf.save());
}

await mkdir(output, { recursive: true });
await saveTextPdf("01-text.pdf", "Control PDF: regular text", ["This synthetic document contains selectable text and no personal data.", "Task: identify the main idea and prepare a short structured summary.", "Product: a soft cotton t-shirt for everyday use."]);
await saveTextPdf("02-table.pdf", "Control PDF: table", ["Task: compare the product options and recommend one."], [["Field", "Option A", "Option B", "Comment"], ["Material", "Cotton", "Cotton + elastane", "B keeps shape"], ["Weight", "160 gsm", "180 gsm", "B is denser"], ["Price", "1490 RUB", "1690 RUB", "Difference 200 RUB"]]);
await saveScanPdf();
