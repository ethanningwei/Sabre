import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordMatches } from "@/lib/session";

afterEach(() => vi.unstubAllEnvs());

describe("shared password", () => {
  it("accepts only the exact password", () => {
    vi.stubEnv("APP_PASSWORD", "correct horse battery");
    expect(passwordMatches("correct horse battery")).toBe(true);
    expect(passwordMatches("correct horse batter")).toBe(false);
    expect(passwordMatches("Correct horse battery")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("refuses to run without a configured password", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(() => passwordMatches("")).toThrow(/APP_PASSWORD/);
  });
});
