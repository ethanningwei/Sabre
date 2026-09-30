import { ddmmyy, toSgt } from "@/lib/parade/time";

/** e.g. "300926 1102H" in Singapore time */
export function formatSgt(instant: Date): string {
  const { date, time } = toSgt(instant);
  return `${ddmmyy(date)} ${time}H`;
}
