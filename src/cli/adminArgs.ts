/**
 * `codepanel admin ...`: the operator commands (adminCommand.ts runs them).
 * They need an admin token, see tools/lib/adminClient.ts.
 */
import type { AdminFeedbackTopic, MonthlyBudget } from "../lib/adminClient";
import { noExtra } from "./tokens";
import { UsageError } from "./usageError";

export type AdminReportName =
	| "system"
	| "treasury"
	| "revenue"
	| "reviews"
	| "repos"
	| "models"
	| "quality"
	| "evals";

export type AdminCommand =
	| { kind: "admin.overview" }
	| { kind: "admin.report"; report: AdminReportName }
	| { kind: "admin.audit"; limit?: number }
	| { kind: "admin.users"; cursor?: string }
	| { kind: "admin.user"; login: string }
	| { kind: "admin.comp"; login: string; until?: string; reason: string }
	| { kind: "admin.uncomp"; login: string; reason: string }
	| { kind: "admin.credit"; login: string; amountUsd: number; requestId: string; reason: string }
	| { kind: "admin.budget"; login: string; monthlyBudgetUsd: MonthlyBudget; reason: string }
	| { kind: "admin.undo"; auditId: string; reason: string }
	| { kind: "admin.refreshModels"; reason: string }
	| { kind: "admin.alertTest"; reason: string }
	| { kind: "admin.release"; sessionId: string; reason: string }
	| { kind: "admin.inbox"; topic?: AdminFeedbackTopic }
	| { kind: "admin.handle"; id: string; reason: string; unhandle: boolean }
	| { kind: "admin.balance"; provider: string; amountUsd: number; asOf?: string; note: string };

interface FlagReader {
	flag(name: string): string | undefined;
	required(name: string): string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d+(\.\d+)?$/;
const REQUEST_ID_PREFIX = "cli-";
const FEEDBACK_TOPICS: readonly AdminFeedbackTopic[] = ["idea", "bug", "pricing", "other"];

function one(positionals: string[], what: string): string {
	const [value, ...extra] = positionals;
	if (!value) throw new UsageError(`expected ${what}`);
	noExtra(extra);
	return value;
}

function amount(text: string | undefined, what: string): number {
	if (!text || !AMOUNT.test(text)) throw new UsageError(`${what} must be a number of dollars`);
	return Number(text);
}

function dateFlag(r: FlagReader, name: string): string | undefined {
	const value = r.flag(name);
	if (value === undefined) return undefined;
	// The round trip refuses a day that does not exist, such as 2027-02-31.
	const parsed = Date.parse(`${value}T00:00:00Z`);
	const real = !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
	if (!DATE.test(value) || !real) {
		throw new UsageError(`--${name} must be a date as YYYY-MM-DD`);
	}
	return value;
}

function limit(r: FlagReader): number | undefined {
	const value = r.flag("limit");
	if (value === undefined) return undefined;
	if (!/^[1-9]\d*$/.test(value)) throw new UsageError("--limit must be a whole number");
	return Number(value);
}

function budgetValue(text: string | undefined): MonthlyBudget {
	if (text === "none") return null;
	if (text === "default") return "default";
	const usd = amount(text, "the budget (or none, or default)");
	if (usd < 0) throw new UsageError("the budget cannot be negative");
	return usd;
}

function topicFlag(r: FlagReader): AdminFeedbackTopic | undefined {
	const value = r.flag("topic");
	if (value === undefined) return undefined;
	const topic = FEEDBACK_TOPICS.find((t) => t === value);
	if (!topic) throw new UsageError(`--topic must be one of ${FEEDBACK_TOPICS.join(", ")}`);
	return topic;
}

/** `rest` is what follows `admin`. */
export function parseAdmin(rest: string[], r: FlagReader): AdminCommand {
	const [sub, ...args] = rest;
	switch (sub) {
		case undefined:
		case "overview":
			noExtra(args);
			return { kind: "admin.overview" };
		case "system":
		case "treasury":
		case "revenue":
		case "reviews":
		case "repos":
		case "models":
		case "quality":
		case "evals":
			noExtra(args);
			return { kind: "admin.report", report: sub };
		case "audit":
			noExtra(args);
			return { kind: "admin.audit", limit: limit(r) };
		case "users":
			noExtra(args);
			return { kind: "admin.users", cursor: r.flag("cursor") };
		case "user":
			return { kind: "admin.user", login: one(args, "a GitHub login") };
		case "comp":
			return {
				kind: "admin.comp",
				login: one(args, "a GitHub login"),
				until: dateFlag(r, "until"),
				reason: r.required("reason"),
			};
		case "uncomp":
			return {
				kind: "admin.uncomp",
				login: one(args, "a GitHub login"),
				reason: r.required("reason"),
			};
		case "credit":
			return parseCredit(args, r);
		case "budget": {
			const [login, value, ...extra] = args;
			noExtra(extra);
			if (!login) throw new UsageError("expected a GitHub login");
			return {
				kind: "admin.budget",
				login,
				monthlyBudgetUsd: budgetValue(value),
				reason: r.required("reason"),
			};
		}
		case "undo":
			return {
				kind: "admin.undo",
				auditId: one(args, "an audit id"),
				reason: r.required("reason"),
			};
		case "balance":
			return parseBalance(args, r);
		case "release":
			return {
				kind: "admin.release",
				sessionId: one(args, "a review round's session id"),
				reason: r.required("reason"),
			};
		case "inbox":
			noExtra(args);
			return { kind: "admin.inbox", topic: topicFlag(r) };
		case "handle":
		case "unhandle":
			return {
				kind: "admin.handle",
				id: one(args, "a feedback message id"),
				reason: r.required("reason"),
				unhandle: sub === "unhandle",
			};
		case "refresh-models":
			noExtra(args);
			return { kind: "admin.refreshModels", reason: r.required("reason") };
		case "alert-test":
			noExtra(args);
			return { kind: "admin.alertTest", reason: r.required("reason") };
		default:
			throw new UsageError(`unknown admin command ${sub}`);
	}
}

function parseCredit(args: string[], r: FlagReader): AdminCommand {
	const [login, value, ...extra] = args;
	noExtra(extra);
	if (!login) throw new UsageError("expected a GitHub login");
	const amountUsd = amount(value, "the amount");
	if (amountUsd === 0) throw new UsageError("the amount cannot be zero");
	return {
		kind: "admin.credit",
		login,
		amountUsd,
		// A retry that reuses the printed id changes nothing the second time.
		requestId: r.flag("request-id") ?? `${REQUEST_ID_PREFIX}${crypto.randomUUID()}`,
		reason: r.required("reason"),
	};
}

function parseBalance(args: string[], r: FlagReader): AdminCommand {
	const [provider, value, ...extra] = args;
	noExtra(extra);
	if (!provider) throw new UsageError("expected a provider");
	const amountUsd = amount(value, "the balance");
	if (amountUsd < 0) throw new UsageError("the balance cannot be negative");
	return {
		kind: "admin.balance",
		provider,
		amountUsd,
		asOf: dateFlag(r, "as-of"),
		note: r.required("note"),
	};
}
