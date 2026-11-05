import { readFileSync } from "node:fs";
import path from "node:path";

/** Read a value from .env.local (tests run outside Next's env loading). */
export function envLocal(name: string): string {
  const file = readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8");
  const line = file.split("\n").find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in .env.local`);
  return line.slice(name.length + 1).trim();
}
