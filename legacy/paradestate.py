'''
Config-driven parade state bot.
ALL structure (coys, subunits, camps, sheet links, telegram targets) lives in
the master config Google Sheet. The only hardcoded ID is CONFIG_SHEET_ID.

Config sheet has THREE tabs:
  CAMPS    (COY | SUBUNIT | CAMP)                      one row per camp/section; row order = display order
  LINKS    (COY | SUBUNIT | SPREADSHEET LINK)          one row per subunit; the ONLY place links live
  SETTINGS (COY | DISPLAY NAME | EXTRA/RF/SOL LINK | TELEGRAM CHAT ID | THREAD ID)  one row per coy

SUBUNIT values are STRICT and used verbatim as the printed subunit name:
  "COY HQ"     -> the COY HQ block (exact casing required)
  "Platoon 5"  -> a platoon (write it out in full — bare "5" is rejected)
  "JGL", "SW"  -> any other subunit name, printed exactly as written
Use identical dropdowns in CAMPS and LINKS so values always match (case-sensitive).

TELEGRAM TARGETING:
  Coys are selected by (TELEGRAM CHAT ID, THREAD ID). Two coys MAY share a chat
  if they have different THREAD IDs (topics); at most one coy per chat may leave
  THREAD ID blank (= the General/main chat). In a chat serving ONE coy, /print
  works from anywhere in the chat. In a chat serving MULTIPLE coys, /print must
  be sent inside the topic mapped to the coy you want.

ERROR HANDLING — "collect everything, then report once":
  A /print is a READ-ONLY validation pass followed by a single message, so there
  is nothing to corrupt by continuing after a problem is found. The bot therefore
  keeps going and gathers EVERY user-fixable problem it can find, then reports
  them all in one message. This replaces the old "fix one typo, /print, discover
  the next typo" loop.

  Two rules keep this safe:
    1. If ANY problem was found, the parade state is NOT rendered at all. You get
       the error list or the report — never a half-valid report.
    2. Only EXPECTED problems are collected (missing dates, bad ATTENDANCE values,
       config typos, missing tabs...). Unexpected exceptions are still allowed to
       propagate and crash loudly, because those are bugs, not user input errors.

  A "barrier" problem (a tab with no NAME column, a spreadsheet that won't open)
  means that one camp/subunit can't be checked any further, so it is skipped —
  but every other camp and subunit is still validated in the same run.

Rules:
- Tab names in parade-state spreadsheets MUST exactly match the CAMP names
  in the config sheet (case and spaces included). Shifts tabs must be named "Shifts".
- STRICT STRUCTURE RULES (enforced, bot refuses to run otherwise):
  * Every subunit referenced in CAMPS must have exactly one LINKS row, and
    every LINKS row must be used by at least one CAMPS row.
  * Each subunit has its OWN spreadsheet (no sharing between subunits).
  * Camp/section names must be unique within a coy (e.g. "PL1 SEC 1", not "SEC 1" twice).
  * No leftover roster tabs: every tab that has roster headers must be assigned
    to that subunit in the config. Prefix a tab name with "_" to archive it.
  * No stale rows in Shifts tabs.
- RANK must be filled in for every person in a roster (blank RANK is an error)
- ROLE column must exist in rosters but its values are neither validated nor counted — informational only
- Config is re-read on every /print, so sheet edits take effect immediately.

Usage:
  python3 paradestate.py           -> runs the telegram bot (needs TOKEN in .env)
  python3 paradestate.py SABRE     -> TEST MODE: prints the Sabre report to the
                                      terminal, never touches Telegram
'''

import re
import io
import os
import sys
import time
import asyncio
import contextlib
from collections import OrderedDict
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from telegram import Update
from telegram.error import BadRequest
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes
from dotenv import load_dotenv

# ===================== THE ONLY HARDCODED SHEET =====================
CONFIG_SHEET_ID = "15rp1OjFtx70YnfNvtMf3z9bu8e4ZaxeLcnkQYaP8BCE"
# ====================================================================

MAX_MESSAGE_LENGTH = 4000
SECTION_SEPARATOR = "———————————————"

HQ_LABEL = "COY HQ"

# A wall of 300 errors helps nobody; show this many and say how many are left.
MAX_REPORTED_ERRORS = 50

ROSTER_COLS = {"RANK", "ROLE", "ATTENDANCE", "START DATE TIME",
               "END DATE TIME", "MA TIMING", "MA LOCATION", "OTHER REASON"}


class ConfigError(ValueError):
	'''Mismatch between the master config sheet and the actual spreadsheets.
	Reported to telegram as CONFIG MISMATCH instead of SCRIPT CRASHED.'''
	pass


# ---------------------- error collection ----------------------
class ErrorCollector:
	'''Accumulates EXPECTED, user-fixable problems so that one /print can report
	them all at once.

	Deliberately does NOT catch arbitrary exceptions — a TypeError or an
	AttributeError is a bug in this script, not something the duty clerk can fix
	in a spreadsheet, and it should still crash loudly.

	Scopes are just labels for grouping the output, e.g.
	    with errors.scope("Platoon 5"):
	        with errors.scope("PL5 SEC 1"):
	            errors.add("'CPL TAN' is marked MC but missing dates")
	prints under the heading "Platoon 5 > PL5 SEC 1".
	'''

	CONFIG = "CONFIG"   # structure / config sheet / access problems
	DATA = "DATA"       # roster data typed in by people

	def __init__(self):
		self.items = []      # [(kind, scope, message)]
		self._scope = []

	@contextlib.contextmanager
	def scope(self, label):
		self._scope.append(str(label))
		try:
			yield
		finally:
			self._scope.pop()

	def add(self, message, is_config=False):
		kind = self.CONFIG if is_config else self.DATA
		self.items.append((kind, " › ".join(self._scope), str(message)))

	@contextlib.contextmanager
	def capture(self, is_config=None):
		'''Barrier: record the problem and abandon whatever this block was
		validating, but let the caller carry on with the next sibling item.
		Only the error types this script raises on purpose are caught.'''
		try:
			yield
		except ConfigError as e:
			self.add(e, is_config=True if is_config is None else is_config)
		except ConnectionError as e:
			self.add(e, is_config=True if is_config is None else is_config)
		except ValueError as e:
			self.add(e, is_config=False if is_config is None else is_config)

	def __len__(self):
		return len(self.items)

	def __bool__(self):
		return bool(self.items)

	def count_since(self, mark):
		return len(self.items) - mark

	def mark(self):
		'''Snapshot used to ask "did that stage add anything?", so we can skip
		follow-up checks whose results would only be misleading cascades.'''
		return len(self.items)

	def format_report(self, what):
		'''One message listing everything found. Grouped config-first, because a
		structural problem is often the CAUSE of the data ones below it.'''
		total = len(self.items)
		shown = self.items[:MAX_REPORTED_ERRORS]
		hidden = total - len(shown)

		out = [f"⚠️ {total} PROBLEM(S) FOUND — {what} was NOT generated.",
		       "Fix everything below, then /print "
		       "again — no restart needed.", ""]

		index = 0
		for kind, heading in ((self.CONFIG, "CONFIG / STRUCTURE PROBLEMS: "),
		                      (self.DATA, "ROSTER DATA PROBLEMS: ")):
			group = [(scope, message) for k, scope, message in shown if k == kind]
			if not group:
				continue
			out.append(heading)
			last_scope = object()
			for scope, message in group:
				if scope != last_scope:
					out.append("")
					out.append(f"[{scope}]" if scope else "[general]")
					last_scope = scope
				index += 1
				out.append(f"{index}. {message}")
			out.append("")

		if hidden > 0:
			out.append(f"…and {hidden} more problem(s) not shown. Fix these first, "
			           f"then /print again to see the rest.")
		return "\n".join(out).rstrip() + "\n"


# ---------------------- small helpers ----------------------
def pad0(number):
	return str(number) if number >= 10 else f'0{number}'

def format_date(date):  # dd/mm/yyyy -> ddmmyy
	return date[0:2] + date[3:5] + date[8:10]

def parse_date_time(part, person):
	tokens = part.split()
	if len(tokens) == 0:
		return "", ""
	elif len(tokens) == 1:
		return tokens[0], ""
	elif len(tokens) == 2:
		return tokens[0], tokens[1]
	else:
		raise ValueError(f"Invalid format for {person}: {part}")

def check_date_time(value, person, column, errors):
	'''Same rule parse_date_time enforces, but checked during VALIDATION so a
	malformed cell is reported alongside everything else instead of blowing up
	halfway through rendering a report we already decided was clean.'''
	if len(str(value).split()) > 2:
		errors.add(f"'{person}': {column} '{value}' has too many parts — "
		           f"use 'date' or 'date time' (e.g. '010126' or '010126 0800')")

def subunit_label(subunit_value, where):
	'''STRICT: the SUBUNIT cell is used verbatim as the subunit's identity and
	printed name. Legacy shorthand is rejected with a pointer to the exact value
	to write. Case-sensitive — use the same dropdown in CAMPS and LINKS.'''
	s = " ".join(subunit_value.split())  # trim + collapse accidental double spaces
	up = s.upper()
	if up == "HQ":
		raise ConfigError(f"{where}: SUBUNIT 'HQ' is not accepted — write exactly '{HQ_LABEL}'.")
	if s.isdigit():
		raise ConfigError(f"{where}: SUBUNIT '{s}' is not accepted — write exactly 'Platoon {s}'.")
	if up == HQ_LABEL and s != HQ_LABEL:
		raise ConfigError(f"{where}: SUBUNIT '{s}' must be written exactly '{HQ_LABEL}' (exact casing).")
	return s


# ---------------------- google sheets plumbing ----------------------
def get_client(credentials_path="credentials.json"):
	scope = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
	try:
		creds = Credentials.from_service_account_file(credentials_path, scopes=scope)
		return gspread.authorize(creds)
	except FileNotFoundError:
		raise FileNotFoundError(f"Credentials file '{credentials_path}' not found.")
	except Exception as e:
		raise ConnectionError(f"Failed to authenticate with Google Sheets: {e}")

def extract_sheet_id(link):
	'''Accepts a full URL or a raw spreadsheet ID.'''
	link = link.strip()
	m = re.search(r"/d/([a-zA-Z0-9\-_]+)", link)
	if m:
		return m.group(1)
	if re.fullmatch(r"[a-zA-Z0-9\-_]{25,}", link):
		return link
	raise ValueError(f"Cannot parse spreadsheet link/ID: '{link}'")

def grid_tab_titles(spreadsheet):
	'''Titles of normal (grid) tabs, skipping chart-only sheets.'''
	return [ws.title for ws in spreadsheet.worksheets()
	        if getattr(ws, "_properties", {}).get("sheetType", "GRID") == "GRID"]

def batch_read_tabs(spreadsheet, tab_names):
	'''Reads MANY tabs of one spreadsheet in ONE api call.
	Returns {tab_name: list_of_rows}.'''
	ranges = ["'" + t.replace("'", "''") + "'" for t in tab_names]
	result = spreadsheet.values_batch_get(ranges)
	out = {}
	for tab, vr in zip(tab_names, result.get("valueRanges", [])):
		out[tab] = vr.get("values", [])
	return out

def values_to_df(rows):
	'''Raw API rows -> DataFrame. The API trims trailing blank cells, so pad.'''
	if not rows:
		return pd.DataFrame()
	header = [h.strip() for h in rows[0]]
	width = len(header)
	body = [(r + [""] * (width - len(r)))[:width] for r in rows[1:]]
	return pd.DataFrame(body, columns=header).fillna('')

def parade_df(rows, tab_name):
	'''Validates + indexes a camp attendance tab.
	These are BARRIER failures: without a NAME column, the required headers, or
	unique names, nothing else about this tab can be checked, so the caller
	records the problem and drops the camp for this run.'''
	df = values_to_df(rows)
	if df.empty or df.columns[0] == '':
		raise ValueError(f"Tab '{tab_name}' has no NAME column or is empty.")
	missing = ROSTER_COLS - set(df.columns)
	if missing:
		raise ValueError(f"Tab '{tab_name}' is missing columns: {sorted(missing)}")
	name_col = df.iloc[:, 0]
	dupes = name_col[name_col.duplicated() & (name_col != '')]
	if not dupes.empty:
		raise ValueError(f"Duplicate names in '{tab_name}': {list(dupes)}")
	df.set_index(df.columns[0], inplace=True)
	return df[df.index.str.strip() != '']

def parse_shifts(rows, errors):
	df = values_to_df(rows)
	if df.empty or "onshift" not in df.columns:
		return {}
	df.set_index(df.columns[0], inplace=True)
	df = df[df.index.str.strip() != '']
	shifts = {}
	for key, value in df["onshift"].to_dict().items():
		camp = str(key).strip()
		text = str(value).strip()
		if text == '':
			shifts[camp] = 0
			continue
		try:
			onshift = int(text)
		except ValueError:
			errors.add(f"'Shifts' tab: onshift value '{value}' for '{camp}' is not a "
			           f"number — use 1 (on shift) or 0 (off shift)", is_config=True)
			continue
		if onshift not in (0, 1):
			# onshift multiplies present strength, so a stray 2 would silently
			# double the camp's numbers instead of failing
			errors.add(f"'Shifts' tab: onshift value '{onshift}' for '{camp}' must be "
			           f"1 (on shift) or 0 (off shift)", is_config=True)
			continue
		shifts[camp] = onshift
	return shifts

def parse_extra_rf(rows, errors):
	df = values_to_df(rows)
	if df.empty:
		return {}
	expected_cols = {"NAME", "RANK", "EXTRA/RF/SOL", "START DATE TIME",
	                 "END DATE TIME", "CAMP & SHIFT"}
	missing = expected_cols - set(df.columns)
	if missing:
		# barrier: without the columns there are no rows worth checking
		errors.add(f"EXTRA/RF/SOL sheet missing columns: {sorted(missing)}", is_config=True)
		return {}
	df.set_index('NAME', inplace=True)
	df = df[df.index.str.strip() != '']

	# every blank cell is reported, not just the first column that has one
	for col in ["RANK", "EXTRA/RF/SOL", "CAMP & SHIFT", "START DATE TIME", "END DATE TIME"]:
		for person in df.index[df[col].str.strip() == ''].tolist():
			errors.add(f"'{person}': missing '{col}'")
	for col in ("START DATE TIME", "END DATE TIME"):
		for person, value in df[col].items():
			check_date_time(value, person, col, errors)

	return {
		duty: {
			camp: list(zip(g['RANK'], g.index, g['START DATE TIME'], g['END DATE TIME']))
			for camp, g in duty_df.groupby('CAMP & SHIFT')
		}
		for duty, duty_df in df.groupby('EXTRA/RF/SOL')
	}


def load_extra_rf(client, sheet_id, errors):
	try:
		ss = client.open_by_key(sheet_id)
	except Exception as e:
		raise ConnectionError(
			f"Failed to open the EXTRA/RF/SOL spreadsheet: {e}\n"
			f"Please check that the EXTRA/RF/SOL LINK in the config's SETTINGS tab is working")
	try:
		return parse_extra_rf(ss.sheet1.get_all_values(), errors)
	except gspread.exceptions.APIError as e:
		raise ConnectionError(f"Google API Error in load_extra_rf: {e}, please try again")


# ---------------------- master config ----------------------
def load_config(client, errors):
	'''Reads CAMPS + LINKS + SETTINGS from the master config sheet, collecting
	every problem it finds instead of stopping at the first one.

	Returns {COY: {display_name, extra_sheet_id, chat_id, thread_id,
	               subunits: OrderedDict{subunit_name: [(camp, sheet_id), ...]}}}

	If `errors` is non-empty afterwards the returned config MUST NOT be used —
	rows with problems are kept in it (with placeholder values) purely so that
	later stages don't emit a cascade of misleading follow-up errors.'''
	ss = client.open_by_key(CONFIG_SHEET_ID)
	data = batch_read_tabs(ss, ["CAMPS", "LINKS", "SETTINGS"])
	camps_df = values_to_df(data["CAMPS"])
	links_df = values_to_df(data["LINKS"])
	settings_df = values_to_df(data["SETTINGS"])

	config = OrderedDict()

	with errors.scope("master config sheet"):
		headers_ok = True
		for tab, df, need in [("CAMPS", camps_df, {"COY", "SUBUNIT", "CAMP"}),
		                      ("LINKS", links_df, {"COY", "SUBUNIT", "SPREADSHEET LINK"}),
		                      ("SETTINGS", settings_df, {"COY", "DISPLAY NAME", "EXTRA/RF/SOL LINK",
		                                                 "TELEGRAM CHAT ID", "THREAD ID"})]:
			missing = need - set(df.columns)
			if missing:
				errors.add(f"Config tab '{tab}' is missing columns: {sorted(missing)}", is_config=True)
				headers_ok = False
		if not headers_ok:
			# barrier: with broken headers nothing below can be read meaningfully
			return config

	# ---------- SETTINGS: one row per coy ----------
	seen_targets = {}  # (chat_id, thread_id) -> coy: forbid two coys sharing chat AND topic
	with errors.scope("config › SETTINGS tab"):
		for i, row in settings_df.iterrows():
			where = f"row {i+2}"
			coy = row["COY"].strip().upper()
			if coy == '':
				continue
			if coy in config:
				errors.add(f"{where}: duplicate coy '{coy}' — one row per coy only", is_config=True)
				continue

			extra_sheet_id = None
			extra_link = row["EXTRA/RF/SOL LINK"].strip()
			if extra_link == '':
				errors.add(f"{where}: '{coy}' needs an EXTRA/RF/SOL LINK", is_config=True)
			else:
				try:
					extra_sheet_id = extract_sheet_id(extra_link)
				except ValueError as e:
					errors.add(f"{where}: {e}", is_config=True)

			thread_id = None
			thread = row["THREAD ID"].strip()
			if thread:
				try:
					thread_id = int(thread)
				except ValueError:
					errors.add(f"{where}: THREAD ID '{thread}' is not a number", is_config=True)

			# a blank chat id is legal: the coy is unreachable from telegram but
			# still fully usable via test mode (python3 paradestate.py <COY>)
			chat_id = None
			chat = row["TELEGRAM CHAT ID"].strip()
			if chat:
				try:
					chat_id = int(chat)
				except ValueError:
					errors.add(f"{where}: TELEGRAM CHAT ID '{chat}' is not a number", is_config=True)

			if chat_id is not None:
				tgt = (chat_id, thread_id)
				if tgt in seen_targets:
					errors.add(
						f"'{coy}' and '{seen_targets[tgt]}' have the SAME TELEGRAM CHAT ID "
						f"({chat_id}) AND the same THREAD ID ({thread_id if thread_id else 'blank'}).\n"
						f"   Sharing one chat between multiple coys IS allowed, but each coy must "
						f"then get its OWN TOPIC in that chat: create one topic per coy in the "
						f"group, and put each topic's numeric THREAD ID in that coy's SETTINGS row. "
						f"At most ONE coy per chat may leave THREAD ID blank (= the General/main "
						f"chat). Once set up, /print sent INSIDE a topic generates that topic's coy.",
						is_config=True)
				else:
					seen_targets[tgt] = coy

			config[coy] = {
				"display_name": row["DISPLAY NAME"].strip() or coy.title(),
				"extra_sheet_id": extra_sheet_id,
				"chat_id": chat_id,
				"thread_id": thread_id,
				"subunits": OrderedDict(),
			}

	# ---------- LINKS: one row per subunit, each with its OWN spreadsheet ----------
	links = {}        # (coy, subunit) -> sheet_id
	sheet_owner = {}  # sheet_id -> (coy, subunit), to forbid sharing
	links_mark = errors.mark()
	with errors.scope("config › LINKS tab"):
		for i, row in links_df.iterrows():
			where = f"row {i+2}"
			coy = row["COY"].strip().upper()
			if coy == '':
				continue
			if coy not in config:
				errors.add(f"{where}: coy '{coy}' has no row in SETTINGS", is_config=True)
				continue
			if row["SUBUNIT"].strip() == '' or row["SPREADSHEET LINK"].strip() == '':
				errors.add(f"{where}: SUBUNIT and SPREADSHEET LINK must be filled", is_config=True)
				continue
			try:
				subunit = subunit_label(row["SUBUNIT"], where)
			except ConfigError as e:
				errors.add(e, is_config=True)
				continue

			key = (coy, subunit)
			if key in links:
				errors.add(f"TWO rows for {coy} {subunit} — one row per subunit only.", is_config=True)
				continue
			try:
				sid = extract_sheet_id(row["SPREADSHEET LINK"])
			except ValueError as e:
				errors.add(f"{where}: {e}", is_config=True)
				continue
			if sid in sheet_owner:
				o_coy, o_sub = sheet_owner[sid]
				errors.add(
					f"{coy} {subunit} and {o_coy} {o_sub} point at the SAME spreadsheet "
					f"(link ...{sid[-6:]}). Each subunit must have its own spreadsheet.",
					is_config=True)
				continue
			sheet_owner[sid] = key
			links[key] = sid
	links_had_errors = errors.count_since(links_mark) > 0

	# ---------- CAMPS: look up each camp's link via (coy, subunit) ----------
	used_links = set()
	camps_mark = errors.mark()
	with errors.scope("config › CAMPS tab"):
		for i, row in camps_df.iterrows():
			where = f"row {i+2}"
			coy = row["COY"].strip().upper()
			if coy == '':
				continue
			if coy not in config:
				errors.add(f"{where}: coy '{coy}' has no row in SETTINGS", is_config=True)
				continue
			if row["SUBUNIT"].strip() == '' or row["CAMP"].strip() == '':
				errors.add(f"{where}: SUBUNIT and CAMP must be filled", is_config=True)
				continue
			try:
				subunit = subunit_label(row["SUBUNIT"], where)
			except ConfigError as e:
				errors.add(e, is_config=True)
				continue

			camp = row["CAMP"].strip()
			key = (coy, subunit)
			if key not in links:
				if not links_had_errors:
					# suppressed when LINKS itself had problems: the missing row is
					# then almost certainly the row we just rejected above
					have = sorted(s for c, s in links if c == coy)
					errors.add(
						f"{where}: no LINKS row for {coy} {subunit}. "
						f"Add its spreadsheet link to the LINKS tab (values are case-sensitive "
						f"and must match exactly). LINKS currently has for {coy}: {have}",
						is_config=True)
				continue

			duplicate_of = next(
				(sub for sub, rows_ in config[coy]["subunits"].items()
				 if any(c == camp for c, _ in rows_)), None)
			if duplicate_of is not None:
				errors.add(
					f"{where}: camp '{camp}' appears twice in {coy} (also under {duplicate_of}). "
					f"Camp/section names must be unique within a coy — e.g. use 'PL1 SEC 1' and "
					f"'PL2 SEC 1', not 'SEC 1' twice.", is_config=True)
				continue

			config[coy]["subunits"].setdefault(subunit, []).append((camp, links[key]))
			used_links.add(key)

	# ---------- no orphan LINKS rows ----------
	# skipped if CAMPS had rejected rows, since those rows' links would look
	# orphaned for a reason we've already reported
	if errors.count_since(camps_mark) == 0:
		unused = [key for key in links if key not in used_links]
		if unused:
			pretty = ", ".join(f"{c} {s}" for c, s in unused)
			with errors.scope("config › LINKS tab"):
				errors.add(
					f"Row(s) with no camps in CAMPS: {pretty}. "
					f"Typo in the SUBUNIT value, or a leftover row from a removed subunit?",
					is_config=True)
	return config


# ---------------------- strength counting ----------------------
def count_strength_camp(camp_matrix, camp_name, onshift, errors):
	reasons = ["HL", "MC", "OL", "AL", "OFF", "MA", "OTHERS"]
	absentees = {reason: [] for reason in reasons}
	# note: RANK must be filled in for every person (checked below), but ROLE
	# only needs to EXIST as a column (header check in parade_df) — its values
	# are neither validated nor counted, purely informational for humans
	# reading the sheet

	total_strength = len(camp_matrix)
	current_strength = len(camp_matrix)

	# EVERY person is checked, so one /print reports all the missing dates in
	# the camp rather than only the first one
	for name in camp_matrix.index:
		# RANK is checked for EVERYONE, before the PRESENT skip below: someone
		# present today may be an absentee tomorrow, and the rank is printed
		# next to their name the moment that happens
		if str(camp_matrix.loc[name, "RANK"]).strip() == "":
			errors.add(f"'{name}': missing RANK")

		reason = camp_matrix.loc[name, "ATTENDANCE"]
		if reason == "PRESENT":
			continue

		if reason not in absentees:
			errors.add(f"'{name}': invalid ATTENDANCE '{reason}' "
			           f"(expected PRESENT or one of {reasons})")
			continue  # unclassifiable, so skip them and keep checking everyone else

		absentees[reason].append(name)
		current_strength -= 1

		if reason == "MA" and str(camp_matrix.loc[name, "MA TIMING"]).strip() == "":
			errors.add(f"'{name}': marked MA but missing MA TIMING")

		if reason == "OTHERS" and str(camp_matrix.loc[name, "OTHER REASON"]).strip() == "":
			# without it the absentee line prints as an empty pair of brackets
			errors.add(f"'{name}': marked OTHERS but missing OTHER REASON")

		if reason not in ("MA", "OTHERS"):
			start = camp_matrix.loc[name, "START DATE TIME"].strip()
			end = camp_matrix.loc[name, "END DATE TIME"].strip()
			if start == "" or end == "":
				errors.add(f"'{name}': marked '{reason}' but missing START/END DATE TIME")

		for col in ("START DATE TIME", "END DATE TIME"):
			check_date_time(camp_matrix.loc[name, col], name, col, errors)

	return {
		"camp_name": camp_name,
		"total_strength": total_strength,
		"current_strength": current_strength * onshift,  # if offshift, present strength = 0
		"absentees": absentees,
		"onshift": onshift,
	}

def count_strength_platoon(all_matrices, shifts, subunit_name, extra_dict, errors):
	platoon_total_strength = 0
	platoon_current_strength = 0
	platoon_strength_state = {}

	for camp_name, df in all_matrices.items():
		with errors.scope(camp_name):
			camp_state = count_strength_camp(df, camp_name, shifts.get(camp_name, 1), errors)  # onshift by default
		platoon_strength_state[camp_name] = camp_state
		platoon_total_strength += camp_state["total_strength"]
		platoon_current_strength += camp_state["current_strength"]
		for duty in ("EXTRA", "RF", "SOL"):
			platoon_current_strength += len(extra_dict.get(duty, {}).get(camp_name, []))

	platoon_strength_state["total_strength"] = platoon_total_strength
	platoon_strength_state["current_strength"] = platoon_current_strength
	platoon_strength_state["subunit_name"] = subunit_name
	return platoon_strength_state


# ---------------------- printing (output format unchanged) ----------------------
def print_camp_strength(camp_strength_state, camp_matrix, hq, extra_dict):
	camp_name = camp_strength_state["camp_name"]
	total_strength = camp_strength_state["total_strength"]
	current_strength = camp_strength_state["current_strength"]
	absentees = camp_strength_state["absentees"]
	onshift = camp_strength_state["onshift"]
	extra_list = extra_dict.get("EXTRA", {}).get(camp_name, [])
	rf_list = extra_dict.get("RF", {}).get(camp_name, [])
	sol_list = extra_dict.get("SOL", {}).get(camp_name, [])

	if hq == 1:
		print(HQ_LABEL)
	print(f'• Total Strength: {pad0(total_strength)}')

	if onshift and hq == 0:
		suffix = ""
		if extra_list: suffix += f' + {pad0(len(extra_list))} EXTRA'
		if rf_list:    suffix += f' + {pad0(len(rf_list))} RF'
		if sol_list:   suffix += f' + {pad0(len(sol_list))} SOL'
		print(f'• Present Strength: {pad0(current_strength)}{suffix}')
		print(f'• Off Shift: 00')
		print("")
	elif onshift and hq == 1:
		print(f'• Present Strength: {pad0(current_strength)}')
		print("")
	else:  # offshift
		print(f'• Present Strength: 00')
		print(f'• Off Shift: {pad0(total_strength)}')
		return
	for label, lst in (("Serving Extra", extra_list), ("RF", rf_list), ("Serving SOL", sol_list)):
		if lst and onshift:
			print(f'{label}: {pad0(len(lst))}')
			print("")
			for i, (rank, name, start_dt, end_dt) in enumerate(lst, start=1):
				if label == "Serving SOL":
					# print SOL dates in the same (ddmmyy - ddmmyy) format as absentees;
					# parse_date_time strips any time portion if one was entered
					start_date, _ = parse_date_time(start_dt, name)
					end_date, _ = parse_date_time(end_dt, name)
					print(f"{i}. {rank} {name} ({start_date} - {end_date})")
				else:
					print(f"{i}. {rank} {name}")
				print("")
	absentee_list = [(reason, person) for reason in absentees for person in absentees[reason]]
	print(f'• Absentees (MC, AL, etc): {pad0(len(absentee_list))}')
	if absentee_list:
		print("")  # blank line before the first absentee entry
	for index, (reason, person) in enumerate(absentee_list, start=1):
		rank = camp_matrix.loc[person, "RANK"]
		start_date, start_time = parse_date_time(camp_matrix.loc[person, "START DATE TIME"], person)
		end_date, end_time = parse_date_time(camp_matrix.loc[person, "END DATE TIME"], person)
		ma_timing = camp_matrix.loc[person, "MA TIMING"]
		ma_location = camp_matrix.loc[person, "MA LOCATION"]
		other_reason = camp_matrix.loc[person, "OTHER REASON"]

		if reason == "MA":
			print(f'{index}. {rank} {person}', end=" ")
			if ma_location == "":
				print(f'({ma_timing}H MA)')
			else:
				print(f'({ma_timing}H MA @ {ma_location})')
		elif reason == "OTHERS":
			print(f'{index}. {rank} {person}', end=" ")
			if start_date != "" and start_time != "" and end_date != "" and end_time != "":
				print(f'({other_reason} {start_date} {start_time}H - {end_date} {end_time}H)')
			elif start_date != "" and end_date != "":
				print(f'({other_reason} {start_date} - {end_date})')
			else:
				print(f'({other_reason})')
		else:  # your typical reasons for absence
			print(f'{index}. {rank} {person}', end=" ")
			if start_date != "" and start_time != "" and end_date != "" and end_time != "":
				print(f'({reason} {start_date} {start_time}H - {end_date} {end_time}H)')
			else:
				print(f'({reason} {start_date} - {end_date})')
		if index < len(absentee_list):  # only print blank line if not the last absentee
			print("")

def print_platoon_strength(platoon_strength_state, all_matrices, extra_dict):
	print(f'{platoon_strength_state["subunit_name"]}')
	print(f'• Total strength: {platoon_strength_state["total_strength"]}')
	print(f'• Present strength: {platoon_strength_state["current_strength"]}')
	print("")

	camp_items = [(k, v) for k, v in platoon_strength_state.items() if type(v) == dict]
	for i, (camp_name, camp_state) in enumerate(camp_items, start=1):
		print(camp_name)
		print_camp_strength(camp_state, all_matrices[camp_name], 0, extra_dict)
		if i < len(camp_items):  # only print blank line if not the last camp
			print("")


# ---------------------- building a coy from config ----------------------
def build_subunit(client, subunit_name, camp_rows, extra_dict, errors, is_hq=False):
	'''camp_rows: ordered list of (camp_name, sheet_id) — all the same sheet_id,
	guaranteed by load_config (links are per-subunit).

	Returns (state, matrices), or None if this subunit hit a barrier problem and
	could not be built. Returning None is safe because the caller refuses to
	render anything at all once `errors` is non-empty.'''
	if is_hq and len(camp_rows) != 1:
		errors.add(f"'{subunit_name}' must have exactly one CAMP row in the config "
		           f"(found {len(camp_rows)})", is_config=True)
		return None

	camps = [camp for camp, _ in camp_rows]
	sid = camp_rows[0][1]
	try:
		ss = client.open_by_key(sid)
	except Exception as e:
		# barrier for this subunit only — the other subunits are still checked,
		# so one broken link doesn't hide the rest of the coy's problems
		errors.add(f"Failed to open spreadsheet ({camps}): {e}\n"
		           f"   Please check that the spreadsheet link for {subunit_name} in the "
		           f"master config sheet is working", is_config=True)
		return None

	titles = grid_tab_titles(ss)
	missing = [c for c in camps if c not in titles]
	if missing:
		errors.add(
			f"Spreadsheet '{ss.title}' has no tab(s) named {missing}. "
			f"Tab names must EXACTLY match the CAMP names in the config sheet. "
			f"Existing tabs: {titles}", is_config=True)
		camps = [c for c in camps if c in titles]

	# read EVERY grid tab in one api call, so orphan tabs can be inspected too
	data = batch_read_tabs(ss, titles)

	# STRICT CHECK: no leftover roster tabs (prefix a tab with "_" to archive it)
	expected = set(camps) | set(missing) | {"Shifts"}
	for t in titles:
		if t in expected or t.startswith("_"):
			continue
		rows = data.get(t, [])
		header = {h.strip() for h in rows[0]} if rows else set()
		if ROSTER_COLS <= header:
			errors.add(
				f"Tab '{t}' in spreadsheet '{ss.title}' looks like a camp roster but is NOT "
				f"assigned to {subunit_name} in the config. If this camp moved subunit, delete "
				f"this leftover tab (or rename it with a leading underscore, e.g. '_{t}', to "
				f"archive it).", is_config=True)

	# STRICT CHECK: no stale rows in the Shifts tab
	shifts = {}
	if "Shifts" in titles:
		shifts = parse_shifts(data["Shifts"], errors)
		stale = [c for c in shifts if c not in camps and c not in missing]
		if stale:
			errors.add(
				f"'Shifts' tab in spreadsheet '{ss.title}' has row(s) for {stale}, which are not "
				f"camps of {subunit_name}. Delete the stale row(s) — leftover from a camp that "
				f"moved?", is_config=True)

	# a camp whose tab is unreadable is dropped, but the remaining camps of this
	# subunit are still fully validated
	all_matrices = OrderedDict()
	for camp in camps:
		try:
			all_matrices[camp] = parade_df(data[camp], camp)
		except ValueError as e:
			errors.add(e, is_config=True)

	time.sleep(0.3)  # be gentle on the api between spreadsheets

	if not all_matrices:
		return None

	if is_hq:
		camp_name = next(iter(all_matrices))
		df = all_matrices[camp_name]
		with errors.scope(camp_name):
			state = count_strength_camp(df, camp_name, shifts.get(camp_name, 1), errors)
		return state, df
	state = count_strength_platoon(all_matrices, shifts, subunit_name, extra_dict, errors)
	return state, all_matrices

def build_coy_state(client, coy_cfg, errors):
	'''VALIDATION PASS: read and check everything, collecting problems as we go.
	Nothing is rendered here.'''
	extra_dict = {}
	with errors.scope("EXTRA/RF/SOL sheet"):
		with errors.capture():
			extra_dict = load_extra_rf(client, coy_cfg["extra_sheet_id"], errors)
	time.sleep(0.3)

	results = OrderedDict()
	for subunit_name, camp_rows in coy_cfg["subunits"].items():
		is_hq = (subunit_name == HQ_LABEL)
		with errors.scope(subunit_name):
			built = build_subunit(client, subunit_name, camp_rows, extra_dict, errors, is_hq)
		if built is not None:
			results[subunit_name] = built
	return results, extra_dict

def render_coy_parade_state(coy_cfg, results, extra_dict):
	'''RENDER PASS: only ever reached when the validation pass came back clean.'''
	coy_total = sum(state["total_strength"] for state, _ in results.values())
	coy_current = sum(state["current_strength"] for state, _ in results.values())

	# Current date and hour in SG time
	sg_time = datetime.now(ZoneInfo("Asia/Singapore"))
	date_string = sg_time.strftime("%d/%m/%Y")
	time_string = sg_time.replace(minute=0, second=0, microsecond=0).strftime("%H%M")

	print(f'{coy_cfg["display_name"]} Parade State', end="\n\n")
	print(f'CAA: {format_date(date_string)} {time_string}H', end="\n\n")
	print(f'Total Strength: {pad0(coy_current)}/{pad0(coy_total)}')
	for name, (state, _) in results.items():
		print(f"{name}: {pad0(state['current_strength'])}/{pad0(state['total_strength'])}")
	for name, (state, matrices) in results.items():
		print(SECTION_SEPARATOR, '\n')
		if name == HQ_LABEL:
			print_camp_strength(state, matrices, 1, extra_dict)
		else:
			print_platoon_strength(state, matrices, extra_dict)

def generate_coy_report(client, coy_cfg):
	'''Validate everything first, THEN render — never both. If a single problem
	was found the caller gets the full problem list and no parade state, so a
	half-valid report can never be mistaken for a real one.'''
	errors = ErrorCollector()
	results, extra_dict = build_coy_state(client, coy_cfg, errors)
	if errors:
		return errors.format_report(f'The {coy_cfg["display_name"]} parade state'), True

	buf = io.StringIO()
	with contextlib.redirect_stdout(buf):
		render_coy_parade_state(coy_cfg, results, extra_dict)
	return buf.getvalue(), False


# ---------------------- message splitting ----------------------
def split_message_by_lines(text, max_length):
	'''Fallback splitter: break at newlines if a single section is too big.'''
	if len(text) <= max_length:
		return [text]
	chunks, current_chunk = [], ""
	for line in text.split("\n"):
		if len(line) > max_length:
			if current_chunk:
				chunks.append(current_chunk)
				current_chunk = ""
			for i in range(0, len(line), max_length):
				chunks.append(line[i:i + max_length])
			continue
		if len(current_chunk) + len(line) + 1 > max_length:
			chunks.append(current_chunk)
			current_chunk = line
		else:
			current_chunk = f"{current_chunk}\n{line}" if current_chunk else line
	if current_chunk:
		chunks.append(current_chunk)
	return chunks

def split_message_by_sections(text, max_length=MAX_MESSAGE_LENGTH):
	'''Split at subunit boundaries, greedily packing sections under max_length.
	Error reports have no section separators and fall through to the line
	splitter, which is fine — a long list of problems splits cleanly at lines.'''
	if len(text) <= max_length:
		return [text]
	parts = text.split(SECTION_SEPARATOR)
	if len(parts) == 1:
		return split_message_by_lines(text, max_length)
	sections = [parts[0]] + [SECTION_SEPARATOR + p for p in parts[1:]]
	chunks, current_chunk = [], ""
	for section in sections:
		if len(section) > max_length:
			if current_chunk:
				chunks.append(current_chunk)
				current_chunk = ""
			chunks.extend(split_message_by_lines(section, max_length))
			continue
		if len(current_chunk) + len(section) > max_length:
			chunks.append(current_chunk)
			current_chunk = section
		else:
			current_chunk += section
	if current_chunk:
		chunks.append(current_chunk)
	return chunks


# ---------------------- telegram ----------------------
last_run_times = {}
busy_targets = set()
generation_lock = asyncio.Lock()  # report text is built via stdout capture; never build two at once

async def reply_chunks(update, text):
	for chunk in split_message_by_sections(text):
		await update.message.reply_text(chunk)

async def handle_print_request(update: Update, context: ContextTypes.DEFAULT_TYPE):
	current_chat_id = update.effective_chat.id
	msg = update.message
	# which topic did /print come from? None = General/main chat.
	incoming_thread = msg.message_thread_id if (msg and getattr(msg, "is_topic_message", False)) else None

	# spam guards are keyed per (chat, topic) so two coys sharing a chat
	# don't rate-limit each other
	guard_key = (current_chat_id, incoming_thread)
	current_time = time.time()
	if current_time - last_run_times.get(guard_key, 0) < 10:
		return  # catches phantom retries / impatient double-taps
	if guard_key in busy_targets:
		return  # a report for this chat+topic is ALREADY being generated — drop the duplicate
	last_run_times[guard_key] = current_time
	busy_targets.add(guard_key)
	try:
		# config is re-read on every /print, so sheet edits take effect immediately
		config_errors = ErrorCollector()
		try:
			client = await asyncio.to_thread(get_client)
			config = await asyncio.to_thread(load_config, client, config_errors)
		except Exception as e:
			await update.message.reply_text(f"❌ Failed to load master config sheet:\n{type(e).__name__}: {e}")
			return
		if config_errors:
			# every config problem at once, not just the first one
			await reply_chunks(update, config_errors.format_report("The parade state"))
			return

		# ---------- coy selection by (chat, topic) ----------
		chat_matches = [c for c in config.values() if c["chat_id"] == current_chat_id]
		if not chat_matches:
			await update.message.reply_text("⛔ This bot is private. Commands are not allowed.")
			return
		if len(chat_matches) == 1:
			# only one coy in this chat: /print works from anywhere in the chat
			coy_cfg = chat_matches[0]
		else:
			# multiple coys share this chat: the TOPIC decides which coy
			coy_cfg = next((c for c in chat_matches if c["thread_id"] == incoming_thread), None)
			if coy_cfg is None:
				listing = "\n".join(
					f"• {c['display_name']}: " +
					(f"topic with THREAD ID {c['thread_id']}" if c["thread_id"] else "the General/main chat")
					for c in chat_matches)
				await update.message.reply_text(
					"⚠️ This chat serves MULTIPLE coys, so the bot picks the coy based on the "
					"TOPIC the /print is sent in — and this topic isn't mapped to any coy.\n\n"
					"Send /print inside the right place:\n" + listing)
				return

		try:
			async with generation_lock:
				# runs in a worker thread -> the bot's event loop NEVER freezes,
				# even if Google hangs for 30s (see 250426 incident)
				final_output, had_errors = await asyncio.to_thread(generate_coy_report, client, coy_cfg)
			if had_errors:
				# mirror crash/config-mismatch logging so the terminal or
				# journalctl shows what the chat was told
				print(final_output, file=sys.__stdout__)
		except ConfigError as e:
			# a structural problem raised outside the collector — shouldn't happen,
			# but reported as a config mismatch rather than a crash if it does
			final_output = f"⚠️ CONFIG MISMATCH!\n\n{e}\n\nFix the sheet(s) and /print again — no restart needed."
			print(final_output, file=sys.__stdout__)
		except Exception as e:
			# NOT collected on purpose: an unexpected exception is a bug in this
			# script, so it still fails loudly instead of being buried in a list
			final_output = f"❌ SCRIPT CRASHED!\n\nError Type: {type(e).__name__}\nDetails: {str(e)}"
			print(final_output, file=sys.__stdout__)

		target_thread_id = coy_cfg["thread_id"]
		try:
			for chunk in split_message_by_sections(final_output):
				kwargs = {"chat_id": current_chat_id, "text": chunk}
				if target_thread_id:
					kwargs["message_thread_id"] = target_thread_id
				await context.bot.send_message(**kwargs)
		except BadRequest as e:
			if "thread not found" in str(e).lower():
				# THREAD ID in SETTINGS points at a topic that doesn't exist in this
				# chat (deleted topic or typo). Report to the MAIN chat, no thread id.
				await context.bot.send_message(
					chat_id=current_chat_id,
					text=(f"⚠️ CONFIG MISMATCH!\n\n"
					      f"THREAD ID {target_thread_id} does not exist in this chat — the topic "
					      f"may have been deleted, or the number is wrong.\n\n"
					      f"Fix the THREAD ID cell in the config's SETTINGS tab (or blank it to "
					      f"post to the main chat) and /print again — no restart needed."))
			else:
				# some other telegram rejection (message too long, no permission, etc)
				print(f"CRITICAL: Failed to send to {current_chat_id}: {e}", file=sys.__stdout__)
				await context.bot.send_message(
					chat_id=current_chat_id,
					text=f"⚠️ ERROR: Telegram refused to send the message.\nReason: {e}")
		except Exception as e:
			print(f"CRITICAL: Failed to send to {current_chat_id}: {e}", file=sys.__stdout__)
			try:
				# deliberately NO thread id here — if the thread was the problem,
				# sending the alert to the same thread would fail too
				await context.bot.send_message(
					chat_id=current_chat_id,
					text=f"⚠️ ERROR: Telegram refused to send the message.\nReason: {e}")
			except Exception as fatal_e:
				print(f"FATAL: Could not even send the error message. {fatal_e}", file=sys.__stdout__)
	finally:
		busy_targets.discard(guard_key)


if __name__ == "__main__":
	load_dotenv()
	# ---------- TEST MODE ----------
	# `python3 paradestate.py SABRE` prints the report to your terminal.
	# Never touches Telegram, so it's safe to run while the live bot is up.
	# Exits 1 if any problems were found, so it can be used in a pre-check script.
	if len(sys.argv) > 1:
		coy_name = sys.argv[1].strip().upper()
		client = get_client()
		config_errors = ErrorCollector()
		config = load_config(client, config_errors)
		if config_errors:
			print(config_errors.format_report("The parade state"))
			sys.exit(1)
		if coy_name not in config:
			print(f"Coy '{coy_name}' not found in config. Available: {list(config.keys())}")
			sys.exit(1)
		output, had_errors = generate_coy_report(client, config[coy_name])
		print(output)
		sys.exit(1 if had_errors else 0)
	# ---------- BOT MODE ----------
	TOKEN = os.getenv("TOKEN")
	if not TOKEN:
		raise RuntimeError("TOKEN not found in .env")
	application = ApplicationBuilder().token(TOKEN).build()
	application.add_handler(CommandHandler("print", handle_print_request))
	print("Bot is now live. Config is loaded from the master sheet on every /print.")
	application.run_polling()
