// Telegram message splitting — port of split_message_by_sections /
// split_message_by_lines (legacy/paradestate.py:889-936). Splits at subunit
// boundaries, packing sections greedily under the limit.

import { SECTION_SEPARATOR } from "./render";

export const MAX_MESSAGE_LENGTH = 4000;

export function splitByLines(text: string, max = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      continue;
    }
    if (current.length + line.length + 1 > max) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function splitMessage(text: string, max = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(SECTION_SEPARATOR);
  if (parts.length === 1) return splitByLines(text, max);
  const sections = [parts[0], ...parts.slice(1).map((p) => SECTION_SEPARATOR + p)];
  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (section.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitByLines(section, max));
      continue;
    }
    if (current.length + section.length > max) {
      chunks.push(current);
      current = section;
    } else {
      current += section;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
