/** Run and print the admin commands (adminArgs.ts). */
import type {
	AdminAlertTest,
	AdminAuditEntry,
	AdminClient,
	AdminEvals,
	AdminHandled,
	AdminInbox,
	AdminOverview,
	AdminQuality,
	AdminRelease,
	AdminReport,
	AdminRepos,
	AdminRevenue,
	AdminReviews,
	AdminUserDetail,
	AdminUserList,
	AdminWrite,
} from "../lib/adminClient";
import type { AdminCommand } from "./adminArgs";
import { formatEvals } from "./adminEvalsFormat";
import { formatHandled, formatInbox } from "./adminInboxFormat";
import { formatQuality } from "./adminQualityFormat";
import { formatRepos } from "./adminReposFormat";
import { formatRevenue } from "./adminRevenueFormat";
import { formatRelease, formatReviews } from "./adminReviewsFormat";

const DATE_CHARS = 10;

export function executeAdmin(command: AdminCommand, admin: AdminClient): Promise<unknown> {
	switch (command.kind) {
		case "admin.overview":
			return admin.overview();
		case "admin.report":
			return admin[command.report]();
		case "admin.audit":
			return admin.audit(command.limit);
		case "admin.users":
			return admin.users(command.cursor);
		case "admin.user":
			return admin.user(command.login);
		case "admin.comp":
			return admin.comp({ login: command.login, until: command.until, reason: command.reason });
		case "admin.uncomp":
			return admin.revokeComp({ login: command.login, reason: command.reason });
		case "admin.credit": {
			const { kind: _, ...args } = command;
			return admin.credits(args);
		}
		case "admin.budget": {
			const { kind: _, ...args } = command;
			return admin.budget(args);
		}
		case "admin.undo":
			return admin.undo({ auditId: command.auditId, reason: command.reason });
		case "admin.refreshModels":
			return admin.refreshModels(command.reason);
		case "admin.alertTest":
			return admin.alertTest(command.reason);
		case "admin.release":
			return admin.release({ sessionId: command.sessionId, reason: command.reason });
		case "admin.inbox":
			return admin.inbox(command.topic);
		case "admin.handle":
			return admin.handle({ id: command.id, reason: command.reason, unhandle: command.unhandle });
		case "admin.balance": {
			const { kind: _, ...args } = command;
			return admin.recordBalance(args);
		}
	}
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, DATE_CHARS);
const usd = (n: number) => `$${n.toFixed(2)}`;
/** Writes answer before and after as text; anything else prints as JSON. */
const compact = (value: unknown) =>
	typeof value === "string" ? value : (JSON.stringify(value) ?? "null");

function formatOverview(o: AdminOverview): string {
	const f = o.figures;
	const problems = o.problems.map((p) => `  [${p.area}] ${p.problem} (codepanel admin ${p.area})`);
	const newest = o.newestUsers.map(
		(u) => `  ${u.login ?? "(unknown)"}  ${day(u.createdAt)}  ${u.plan}`,
	);
	return [
		`Status: ${o.status}`,
		...(problems.length ? ["Problems:", ...problems] : []),
		`Last ${f.days} days: ${f.signups} signups, ${f.reviews} reviews (${f.failedReviews} failed), platform cost ${usd(f.platformCostUsd)}, credits sold ${usd(f.creditsSoldUsd)}`,
		"Newest users:",
		...newest,
	].join("\n");
}

function formatReport(name: string, r: AdminReport): string {
	const problems = r.problems.map((p) => `  ${p}`);
	return [`${name}: ${r.status}`, ...problems, "Add --json for the full report."].join("\n");
}

function formatReportFor(name: string, result: unknown): string {
	if (name === "revenue") return formatRevenue(result as AdminRevenue);
	if (name === "repos") return formatRepos(result as AdminRepos);
	if (name === "evals") return formatEvals(result as AdminEvals);
	if (name === "quality") return formatQuality(result as AdminQuality);
	if (name === "reviews") return formatReviews(result as AdminReviews);
	return formatReport(name, result as AdminReport);
}

function formatAudit(entries: AdminAuditEntry[]): string {
	if (entries.length === 0) return "No operator actions yet.";
	return entries
		.map((e) => {
			const id = e.id ? `${e.id}  ` : "";
			return `${id}${day(e.createdAt)}  ${e.operator ?? "deployment"}  ${e.action} ${e.targetLabel}: ${e.reason}`;
		})
		.join("\n");
}

function formatUsers(list: AdminUserList): string {
	if (list.users.length === 0) return "No accounts.";
	const rows = list.users.map((u) => {
		const state = u.deleting ? "  (deleting)" : "";
		return `${u.login ?? "(unknown)"}  ${day(u.createdAt)}  ${u.plan}  credits ${usd(u.creditsUsd)}${state}`;
	});
	const more = list.nextCursor ? [`More: codepanel admin users --cursor ${list.nextCursor}`] : [];
	return [...rows, ...more].join("\n");
}

function planLine(d: AdminUserDetail): string {
	const sub = d.subscription
		? `, subscription ${d.subscription.status} to ${day(d.subscription.currentPeriodEnd)}${d.subscription.cancelAtPeriodEnd ? " (cancels)" : ""}`
		: "";
	const comp = d.comp
		? `, comp ${d.comp.until === null ? "with no end" : `to ${day(d.comp.until)}`}${d.comp.current ? "" : " (lapsed)"}`
		: "";
	return `Plan: ${d.user.plan}${sub}${comp}`;
}

function budgetLine(b: AdminUserDetail["budget"]): string {
	const limit = b.limitUsd === null ? "no limit" : `${usd(b.limitUsd)} (${b.source})`;
	return `Budget: ${limit}; this month ${usd(b.ownKeyUsd)} own keys, ${usd(b.platformUsd)} on credits`;
}

function formatUser(d: AdminUserDetail): string {
	const c = d.credits;
	const repos = d.repos.map(
		(r) => `  ${r.fullName}${r.active ? "" : " (inactive)"}  ${usd(r.monthUsd)} this month`,
	);
	const audit = d.audit.map((e) => {
		const undo =
			e.undoable && e.id ? `  (undo: codepanel admin undo ${e.id} --reason "<why>")` : "";
		return `  ${day(e.createdAt)}  ${e.action}: ${e.reason}${undo}`;
	});
	return [
		`${d.user.login ?? "(unknown)"}  joined ${day(d.user.createdAt)}${d.user.deleting ? "  (deleting)" : ""}`,
		planLine(d),
		`Credits: ${usd(c.topupUsd)} purchased, ${usd(c.allowanceUsd)} allowance${c.starterGranted ? ", starter granted" : ""}`,
		budgetLine(d.budget),
		...(repos.length ? ["Repos:", ...repos] : ["Repos: none"]),
		...(d.reposPartial ? ["  (more repos not shown)"] : []),
		...(audit.length ? ["Operator actions:", ...audit] : []),
		"Add --json for everything.",
	].join("\n");
}

function formatWrite(w: AdminWrite): string {
	const applied = w.applied
		? "Applied."
		: "Not applied: this request was already handled, nothing changed.";
	const undo =
		w.undo === null || w.undo === undefined
			? []
			: [`Undo: codepanel admin undo ${w.auditId} --reason "<why>"`];
	return [
		applied,
		`Audit id: ${w.auditId}`,
		`before: ${compact(w.before)}`,
		`after: ${compact(w.after)}`,
		...undo,
	].join("\n");
}

function formatBalance(command: { provider: string; amountUsd: number }, result: unknown): string {
	const id =
		typeof result === "object" && result !== null && "id" in result && typeof result.id === "string"
			? `, id ${result.id}`
			: "";
	return `Recorded the ${command.provider} balance (${usd(command.amountUsd)})${id}. See codepanel admin treasury.`;
}

function formatAlertTest(r: AdminAlertTest): string {
	const outcome = r.delivered
		? `Delivered (HTTP ${r.httpStatus}).`
		: `Not delivered: ${r.error ?? "unknown error"}.`;
	return `${outcome}\nAudit id: ${r.auditId}`;
}

/**
 * What to say before a command runs, on stderr: a credit's request id, so a
 * retry after a failed or timed-out call can reuse it instead of crediting twice.
 */
export function adminNotice(command: AdminCommand): string | undefined {
	if (command.kind !== "admin.credit") return undefined;
	return `Request id: ${command.requestId} (pass --request-id ${command.requestId} to retry safely)`;
}

export function formatAdmin(command: AdminCommand, result: unknown): string {
	switch (command.kind) {
		case "admin.overview":
			return formatOverview(result as AdminOverview);
		case "admin.report":
			return formatReportFor(command.report, result);
		case "admin.audit":
			return formatAudit((result as { entries: AdminAuditEntry[] }).entries);
		case "admin.users":
			return formatUsers(result as AdminUserList);
		case "admin.user":
			return formatUser(result as AdminUserDetail);
		case "admin.balance":
			return formatBalance(command, result);
		case "admin.inbox":
			return formatInbox(result as AdminInbox);
		case "admin.handle":
			return formatHandled(result as AdminHandled);
		case "admin.release":
			return formatRelease(result as AdminRelease);
		case "admin.refreshModels": {
			const r = result as { before: unknown; after: unknown };
			return `Refreshed.\nbefore: ${compact(r.before)}\nafter: ${compact(r.after)}`;
		}
		case "admin.alertTest":
			return formatAlertTest(result as AdminAlertTest);
		default:
			return formatWrite(result as AdminWrite);
	}
}
