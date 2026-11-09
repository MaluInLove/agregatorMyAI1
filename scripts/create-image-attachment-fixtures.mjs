import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { createCanvas } = require("../.artifact-node-modules/@napi-rs/canvas");
const sharp = require("sharp");
const output = join(process.cwd(), "tmp", "image-fixtures");

function canvas() {
  const value = createCanvas(1200, 800);
  const context = value.getContext("2d");
  context.fillStyle = "#f4f0e6";
  context.fillRect(0, 0, 1200, 800);
  return [value, context];
}

async function createPng() {
  const [image, context] = canvas();
  context.fillStyle = "#586f3f";
  context.fillRect(0, 0, 1200, 92);
  context.fillStyle = "#ffffff";
  context.font = "bold 42px Arial";
  context.fillText("SOFT COTTON T-SHIRT", 55, 60);
  context.fillStyle = "#457ca7";
  context.beginPath();
  context.moveTo(360, 195); context.lineTo(545, 155); context.lineTo(660, 220);
  context.lineTo(780, 190); context.lineTo(900, 320); context.lineTo(780, 375);
  context.lineTo(745, 650); context.lineTo(385, 650); context.lineTo(350, 375);
  context.lineTo(235, 320); context.closePath(); context.fill();
  context.fillStyle = "#22313f";
  context.font = "bold 38px Arial";
  context.fillText("Everyday comfort", 70, 285);
  context.font = "32px Arial";
  context.fillText("100% cotton", 70, 350);
  context.fillText("Price: 1490 RUB", 70, 405);
  await writeFile(join(output, "01-shirt-text.png"), await image.encode("png"));
}

async function createJpeg() {
  const [image, context] = canvas();
  context.fillStyle = "#d9c5ae";
  context.fillRect(0, 0, 1200, 800);
  context.fillStyle = "#ffffff";
  context.fillRect(335, 105, 530, 585);
  context.strokeStyle = "#8c7156";
  context.lineWidth = 5;
  context.strokeRect(335, 105, 530, 585);
  context.fillStyle = "#1f1f1f";
  context.font = "bold 44px Arial";
  context.fillText("ORDER RECEIPT", 420, 205);
  context.font = "32px Arial";
  context.fillText("Order #4187", 440, 290);
  context.fillText("Canvas bag", 440, 370);
  context.fillText("Total: 1290 RUB", 440, 510);
  context.fillStyle = "#b83e3e";
  context.fillRect(70, 420, 190, 180);
  context.strokeStyle = "#5c2424";
  context.lineWidth = 20;
  context.beginPath(); context.arc(165, 420, 70, Math.PI, 0); context.stroke();
  const png = await image.encode("png");
  await sharp(png).jpeg({ quality: 88 }).toFile(join(output, "02-receipt-bag.jpg"));
}

await mkdir(output, { recursive: true });
await createPng();
await createJpeg();
