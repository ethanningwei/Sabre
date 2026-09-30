'''
One-time export of a coy from the Google Sheets into sabre-export.json, for
`npm run import`. Re-runnable until cutover.

Reuses the bot's own code (legacy/paradestate.py), so the export only succeeds
when the bot itself would print a clean parade state — the same problem list
is printed otherwise. Nothing is ever written to the sheets.

The file also contains the bot's rendered parade state, so the importer can
prove the web app prints the exact same text from the imported data.

Usage (from the repo root, credentials.json next to it — never commit it):
    pip3 install --upgrade gspread pandas python-telegram-bot python-dotenv google-auth
    python3 scripts/export_from_sheets.py            # SABRE -> sabre-export.json
    python3 scripts/export_from_sheets.py "PL5-8 COY" other-export.json

The output contains names and medical status: keep it off git and delete it
after the import.
'''

import contextlib
import io
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "legacy"))
import paradestate as ps  # noqa: E402

DUTY_TYPES = ("EXTRA", "RF", "SOL")


def main():
    coy_key = (sys.argv[1] if len(sys.argv) > 1 else "SABRE").strip().upper()
    out_path = sys.argv[2] if len(sys.argv) > 2 else "sabre-export.json"
    client = ps.get_client(os.environ.get("CREDENTIALS", "credentials.json"))

    errors = ps.ErrorCollector()
    config = ps.load_config(client, errors)
    if errors:
        print(errors.format_report("The export"))
        sys.exit(1)
    if coy_key not in config:
        print(f"Coy '{coy_key}' not found in config. Available: {list(config.keys())}")
        sys.exit(1)
    cfg = config[coy_key]

    errors = ps.ErrorCollector()
    results, extra_dict = ps.build_coy_state(client, cfg, errors)
    if errors:
        print(errors.format_report("The export"))
        sys.exit(1)

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        ps.render_coy_parade_state(cfg, results, extra_dict)
    bot_text = buf.getvalue()
    # the CAA the bot just printed (line 3: "CAA: ddmmyy HHMMH")
    caa_line = bot_text.split("\n")[2]

    def people_of(df):
        rows = []
        for name in df.index:
            r = df.loc[name]
            rows.append({
                "name": str(name),
                "rank": str(r["RANK"]),
                "role": str(r["ROLE"]),
                "attendance": str(r["ATTENDANCE"]),
                "start": str(r["START DATE TIME"]),
                "end": str(r["END DATE TIME"]),
                "maTiming": str(r["MA TIMING"]),
                "maLocation": str(r["MA LOCATION"]),
                "otherReason": str(r["OTHER REASON"]),
            })
        return rows

    subunits = []
    for subunit_name, (state, matrices) in results.items():
        if subunit_name == ps.HQ_LABEL:
            camps = [{"name": state["camp_name"], "onShift": bool(state["onshift"]), "people": people_of(matrices)}]
        else:
            camps = [
                {"name": camp_name, "onShift": bool(state[camp_name]["onshift"]), "people": people_of(df)}
                for camp_name, df in matrices.items()
            ]
        subunits.append({"name": subunit_name, "isHq": subunit_name == ps.HQ_LABEL, "camps": camps})

    duties, skipped = [], []
    for duty_type, by_camp in extra_dict.items():
        for camp_name, entries in by_camp.items():
            for rank, name, start, end in entries:
                row = {"type": duty_type, "camp": camp_name, "rank": str(rank), "name": str(name),
                       "start": str(start), "end": str(end)}
                (duties if duty_type in DUTY_TYPES else skipped).append(row)

    export = {
        "exportedAt": datetime.now(ZoneInfo("Asia/Singapore")).isoformat(),
        "coy": {
            "key": coy_key,
            "displayName": cfg["display_name"],
            "telegramChatId": str(cfg["chat_id"]) if cfg["chat_id"] is not None else None,
            "telegramThreadId": str(cfg["thread_id"]) if cfg["thread_id"] is not None else None,
        },
        "subunits": subunits,
        "duties": duties,
        "botText": bot_text,
        "caaLine": caa_line,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(export, f, ensure_ascii=False, indent=1)

    n_people = sum(len(c["people"]) for s in subunits for c in s["camps"])
    print(f"Exported {coy_key}: {len(subunits)} subunits, "
          f"{sum(len(s['camps']) for s in subunits)} camps, {n_people} people, {len(duties)} Extra/RF/SOL -> {out_path}")
    if skipped:
        print(f"Note: {len(skipped)} extras-sheet row(s) with a duty other than {DUTY_TYPES} were skipped "
              f"(the bot ignores them too): {[r['name'] for r in skipped]}")
    print(f"Bot output captured at {caa_line}. Now run: npm run import -- {out_path}")


if __name__ == "__main__":
    main()
