import { sql } from "drizzle-orm";
import {
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
// Auth (Better Auth core tables + our role/scope fields on user)
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["pending", "guardcomm", "admin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: userRole("role").default("pending").notNull(),
  /** a guardcomm's scope: the platoon/subunit they may edit */
  subunitId: uuid("subunit_id").references(() => subunit.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
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
