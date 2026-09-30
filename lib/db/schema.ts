import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Sign-in: one shared password (APP_PASSWORD). Each person types their name,
// which becomes a `user` row so every change is still attributed.
// role/subunitId are kept for when individual logins come back; with the
// shared password everyone is an admin.
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["pending", "guardcomm", "admin"]);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    role: userRole("role").default("admin").notNull(),
    /** a guardcomm's scope: the platoon/subunit they may edit */
    subunitId: uuid("subunit_id").references(() => subunit.id, { onDelete: "set null" }),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("user_name_uq").on(sql`lower(${t.name})`)],
);

export const appSession = pgTable(
  "app_session",
  {
    /** sha256 of the cookie token — the token itself is never stored */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** HMAC of the shared password at sign-in: changing APP_PASSWORD signs everyone out */
    passwordTag: text("password_tag").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("app_session_user_idx").on(t.userId)],
);

export const loginFailure = pgTable(
  "login_failure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    at: timestamp("at").defaultNow().notNull(),
  },
  (t) => [index("login_failure_ip_at_idx").on(t.ip, t.at)],
);

// ---------------------------------------------------------------------------
// Company structure
// ---------------------------------------------------------------------------

export const coy = pgTable("coy", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** stable internal key, e.g. SABRE — never printed */
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
  telegramChatId: text("telegram_chat_id"),
  telegramThreadId: text("telegram_thread_id"),
});

export const subunit = pgTable(
  "subunit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coyId: uuid("coy_id")
      .notNull()
      .references(() => coy.id, { onDelete: "cascade" }),
    /** printed verbatim, e.g. "COY HQ", "PLATOON 5" */
    name: text("name").notNull(),
    isHq: boolean("is_hq").default(false).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [uniqueIndex("subunit_coy_name_uq").on(t.coyId, t.name)],
);

export const camp = pgTable(
  "camp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coyId: uuid("coy_id")
      .notNull()
      .references(() => coy.id, { onDelete: "cascade" }),
    subunitId: uuid("subunit_id")
      .notNull()
      .references(() => subunit.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** physical camp shared by teams that take turns (SFT A + SFT B = "SFT"); null = its own name */
    post: text("post"),
    sortOrder: integer("sort_order").notNull(),
    onShift: boolean("on_shift").default(true).notNull(),
  },
  // camp names are unique within a coy (Extra/RF attach by camp)
  (t) => [uniqueIndex("camp_coy_name_uq").on(t.coyId, t.name)],
);

export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campId: uuid("camp_id")
      .notNull()
      .references(() => camp.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    rank: text("rank").notNull(),
    role: text("role").default("").notNull(),
    sortOrder: integer("sort_order").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("person_camp_name_uq").on(t.campId, t.name).where(sql`${t.active}`)],
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const absenceType = pgEnum("absence_type", ["HL", "MC", "OL", "AL", "OFF", "MA", "OTHERS"]);

export const absence = pgTable(
  "absence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    type: absenceType("type").notNull(),
    otherReason: text("other_reason").default("").notNull(),
    startDate: date("start_date"),
    /** 'HHMM' */
    startTime: text("start_time"),
    endDate: date("end_date"),
    endTime: text("end_time"),
    maTiming: text("ma_timing").default("").notNull(),
    maLocation: text("ma_location").default("").notNull(),
    /** set when the app created this absence for an Extra/RF ("RF @ BDK"); it follows the duty */
    dutyId: uuid("duty_id").references((): AnyPgColumn => duty.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** null = currently absent. Closed rows are kept as history (MC/leave tracking). */
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    // at most ONE open absence per person
    uniqueIndex("absence_one_open_uq").on(t.personId).where(sql`${t.closedAt} is null`),
    index("absence_person_idx").on(t.personId),
  ],
);

export const dutyType = pgEnum("duty_type", ["EXTRA", "RF", "SOL"]);

export const duty = pgTable(
  "duty",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coyId: uuid("coy_id")
      .notNull()
      .references(() => coy.id, { onDelete: "cascade" }),
    type: dutyType("type").notNull(),
    rank: text("rank").notNull(),
    name: text("name").notNull(),
    /** optional link to the roster person serving this duty */
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    campId: uuid("camp_id")
      .notNull()
      .references(() => camp.id, { onDelete: "restrict" }),
    startDate: date("start_date"),
    startTime: text("start_time"),
    endDate: date("end_date"),
    endTime: text("end_time"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("duty_camp_idx").on(t.campId)],
);

// ---------------------------------------------------------------------------
// Output + audit
// ---------------------------------------------------------------------------

export const paradeState = pgTable(
  "parade_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coyId: uuid("coy_id")
      .notNull()
      .references(() => coy.id, { onDelete: "cascade" }),
    /** CAA in SGT */
    caaDate: date("caa_date").notNull(),
    caaTime: text("caa_time").notNull(),
    text: text("text").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    generatedBy: text("generated_by").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at"),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    telegramMessageIds: jsonb("telegram_message_ids").$type<number[]>(),
  },
  (t) => [index("parade_state_coy_generated_idx").on(t.coyId, t.generatedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at").defaultNow().notNull(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);
