// Blocking checks run before every parade state — the web app's version of the
// bot's ErrorCollector. Same principle: collect EVERY problem in one pass, and
// if there are any, no parade state is produced.
//
// Only what gets PRINTED or COUNTED is checked. An off-shift camp shows as
// 00 present with no names, so its people are not checked at all: a stale MC
// in a dismounted team must not block the parade state.
//
// The bot's sheet-structure checks (tab names, headers, links, orphan tabs,
// stale Shifts rows, onshift values, duplicate names) are gone: the schema and
// forms make those states impossible.

import { indexCamps, servingCampId } from "./compute";
import { caaKey, ddmmyy, endKey, type SgtParts } from "./time";
import { DATED_ABSENCE_TYPES, type CoySnapshot, type Issue } from "./types";

export function validate(snapshot: CoySnapshot, caa: SgtParts): Issue[] {
  const issues: Issue[] = [];
  const now = caaKey(caa);
  const idx = indexCamps(snapshot);
  const campScope = new Map<string, string[]>();

  for (const subunit of snapshot.subunits) {
    if (subunit.isHq && subunit.camps.length !== 1) {
      issues.push({
        code: "hq-camp-count",
        scope: [subunit.name],
        message: `${subunit.name} must have exactly one camp (found ${subunit.camps.length})`,
        target: { kind: "subunit", subunitId: subunit.id },
      });
    }

    for (const camp of subunit.camps) {
      const scope = subunit.isHq ? [subunit.name] : [subunit.name, camp.name];
      campScope.set(camp.id, scope);

      if (camp.people.length === 0) {
        issues.push({
          code: "empty-camp",
          scope,
          message: `'${camp.name}' has nobody in it — add people or remove the camp`,
          target: { kind: "camp", campId: camp.id },
        });
      }

      if (!camp.onShift) continue; // nothing about its people is printed

      for (const person of camp.people) {
        const target = { kind: "person", campId: camp.id, personId: person.id } as const;
        const add = (code: Issue["code"], message: string) =>
          issues.push({ code, scope, message: `'${person.name}': ${message}`, target });

        // checked for everyone on shift, including PRESENT: the rank prints
        // the moment they become an absentee
        if (person.rank.trim() === "") add("missing-rank", "missing RANK");

        const a = person.absence;
        if (!a) continue;

        if (a.type === "MA") {
          if (a.maTiming.trim() === "") add("missing-ma-timing", "marked MA but missing MA timing");
          // an MA is for one day; still marked after that day = forgotten
          if (a.startDate && a.startDate < caa.date) {
            add("overdue-absence", `MA on ${ddmmyy(a.startDate)} has passed — mark them back or update it`);
          }
          continue;
        }

        if (a.type === "OTHERS" && a.otherReason.trim() === "") {
          add("missing-other-reason", "marked OTHERS but missing the reason");
        }

        if (DATED_ABSENCE_TYPES.includes(a.type) && (!a.startDate || !a.endDate)) {
          add("missing-dates", `marked '${a.type}' but missing start/end date`);
        }

        if (a.endDate && endKey(a.endDate, a.endTime) < now) {
          const label = a.type === "OTHERS" ? a.otherReason.trim() || "OTHERS" : a.type;
          add(
            "overdue-absence",
            `${label} ended ${ddmmyy(a.endDate)}${a.endTime ? ` ${a.endTime}H` : ""} — mark them back or extend it`,
          );
        }
      }
    }
  }

  for (const duty of snapshot.duties) {
    const at = servingCampId(duty, idx);
    if (!at) continue; // not counted right now, so nothing about it is printed

    const scope = [...(campScope.get(at) ?? []), "Extra/RF/SOL"];
    const target = { kind: "duty", dutyId: duty.id } as const;
    const who = `'${duty.rank} ${duty.name}' (${duty.type})`;
    if (duty.rank.trim() === "") {
      issues.push({ code: "missing-rank", scope, message: `'${duty.name}' (${duty.type}): missing RANK`, target });
    }
    if (!duty.startDate || !duty.endDate) {
      issues.push({ code: "duty-missing-dates", scope, message: `${who}: missing start/end date`, target });
    } else if (endKey(duty.endDate, duty.endTime) < now) {
      issues.push({
        code: "overdue-duty",
        scope,
        message: `${who}: ended ${ddmmyy(duty.endDate)} — remove them or extend it`,
        target,
      });
    }

    // Extra/RF away from an on-shift home team: they must be absent there,
    // or they'd be counted in both places.
    if (duty.personId && duty.type !== "SOL") {
      const home = idx.homeOf.get(duty.personId);
      const person = home?.people.find((p) => p.id === duty.personId);
      if (home?.onShift && person && !person.absence) {
        issues.push({
          code: "double-counted",
          scope,
          message: `${who} is also counted present at ${home.name} — mark them absent there (${duty.type} @ ${idx.camps.get(at)?.name})`,
          target: { kind: "person", campId: home.id, personId: person.id },
        });
      }
    }
  }

  return issues;
}
