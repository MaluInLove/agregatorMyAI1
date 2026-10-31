import "dotenv/config";

import { spawn } from "node:child_process";
import path from "node:path";

export function localBinary(name: string): string {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return path.join(process.cwd(), "node_modules", ".bin", `${name}${extension}`);
}

export async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(command)} ended with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}.`));
    });
  });
}

export function runNodeScript(scriptPath: string, args: string[]): Promise<void> {
  return runCommand(process.execPath, [scriptPath, ...args]);
}

export function environmentError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://***@");
  }

  return "Unknown error";
}
