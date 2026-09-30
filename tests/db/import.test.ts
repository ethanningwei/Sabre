import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDateTime, parseExport } from "@/lib/data/parse-export";
import { getCoyByKey, loadSnapshot } from "@/lib/data/snapshot";
import { writeCoy } from "@/lib/data/write-coy";
import { db } from "@/lib/db";
import { renderParadeState } from "@/lib/parade";
import { exampleExport } from "../fixtures/example-export";

const golden = readFileSync(join(__dirname, "../fixtures/example-300926.txt"), "utf8");

describe("parseDateTime", () => {
  it("accepts ddmmyy and ddmmyy hhmm (with or without a trailing H)", () => {
    expect(parseDateTime("")).toEqual({ date: null, time: null });
    expect(parseDateTime("290926")).toEqual({ date: "2026-09-29", time: null });
    expect(parseDateTime(" 290926 2100 ")).toEqual({ date: "2026-09-29", time: "2100" });
    expect(parseDateTime("290926 2100H")).toEqual({ date: "2026-09-29", time: "2100" });
  });
  it("explains what's wrong otherwise", () => {
    expect(parseDateTime("010126 0800 xx")).toMatch(/too many parts/);
    expect(parseDateTime("29/09/26")).toMatch(/isn't a ddmmyy date/);
    expect(parseDateTime("310226")).toMatch(/isn't a ddmmyy date/);
    expect(parseDateTime("290926 25:00")).toMatch(/isn't an hhmm time/);
  });
});

let reachable = true;
beforeAll(async () => {
  try {
    await db.execute("select 1");
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  await db.$client.end();
});

describe("sheet import", () => {
  it("imports an export and reproduces the bot's text exactly", async (ctx) => {
    if (!reachable) ctx.skip();
    const { input, problems } = parseExport(exampleExport());
    expect(problems).toEqual([]);
    await writeCoy(db, input);
    const coyRow = await getCoyByKey("SABRE");
    expect(coyRow.telegramChatId).toBe("-100123");
    expect(renderParadeState(await loadSnapshot(coyRow), { date: "2026-09-30", time: "1100" })).toBe(golden);
  });

  it("ties an SOL to the person's home team when their name is found in the other team", () => {
    const data = exampleExport();
    const sftA = data.subunits[1].camps[0];
    sftA.people[0] = { ...sftA.people[0], name: "HAOYANG" }; // HAOYANG belongs to SFT A
    const { input } = parseExport(data);
    const sol = input.duties.find((d) => d.type === "SOL")!;
    expect(sol.campId).toBe("SFT A");
    expect(sol.personId).toBe(input.subunits[1].camps[0].people[0].id);
    // SFT A is off shift, so it still counts under SFT B — same text as the bot
    expect(renderParadeState(input, { date: "2026-09-30", time: "1100" })).toContain(
      "Serving SOL: 01\n\n1. PTE HAOYANG (250926 - 081026)",
    );
  });

  it("reports every bad cell at once", () => {
    const data = exampleExport();
    const hdn = data.subunits[1].camps[3].people;
    hdn[0].start = "28/09/26";
    hdn[1].attendance = "HOSPITALISED";
    data.duties[0].end = "081026 0800 xx";
    const { problems } = parseExport(data);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("PLATOON 5 › HDN › 'ZHARFAN'");
  });
});
