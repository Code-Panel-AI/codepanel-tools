/** `codepanel admin reviews` and `admin release`, printed as summaries; --json prints the whole response. */
import type { AdminRelease, AdminReviewRound, AdminReviews } from "../lib/adminClient";

const DATE_TIME_CHARS = 16;
/** Rounds printed per list; the API returns more and --json prints them all. */
const LISTED = 5;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const when = (ms: number) => new Date(ms).toISOString().slice(0, DATE_TIME_CHARS).replace("T", " ");
const who = (login: string | null) => login ?? "(unknown)";
const pr = (r: { repo: string | null; prNumber: number | null }) =>
	`${r.repo ?? "(removed repo)"}${r.prNumber === null ? "" : `#${r.prNumber}`}`;
const counts = (rows: { code: string; count: number }[]) =>
	rows.map((c) => `${c.code} ${c.count}`).join(", ") || "none";

function duration(ms: number | null): string {
	if (ms === null) return "-";
	const seconds = Math.round(ms / MS_PER_SECOND);
	return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}s`;
}

function list<T>(title: string, rows: T[], total: number, line: (row: T) => string): string[] {
	if (rows.length === 0) return [];
	const shown = rows.slice(0, LISTED);
	const more = total > shown.length ? [`  ...and ${total - shown.length} more (--json)`] : [];
	return [`${title}:`, ...shown.map((r) => `  ${line(r)}`), ...more];
}

function runningLine(r: AdminReviewRound): string {
	const state = r.stuck ? "STUCK" : r.status;
	const release = r.stuck ? `  (codepanel admin release ${r.sessionId} --reason "<why>")` : "";
	return `${pr(r)}  ${who(r.login)}  ${state} since ${when(r.createdAt)}${release}`;
}

function failedLine(r: AdminReviewRound): string {
	return `${pr(r)}  ${who(r.login)}  ${r.kind ?? "failed"}  ${when(r.completedAt ?? r.createdAt)}`;
}

export function formatReviews(r: AdminReviews): string {
	const run = r.running;
	const rate =
		r.recent.failureRate === null
			? "too few to rate"
			: `${Math.round(r.recent.failureRate * 100)}%`;
	const d = r.durations;
	return [
		`reviews: ${r.status}`,
		...r.problems.map((p) => `  ${p}`),
		`Running: ${run.count}${run.truncated ? "+" : ""}, ${run.stuck} stuck past the ${r.leaseMinutes}-minute lease`,
		...list("Running rounds", run.rows, run.count, runningLine),
		`Last ${r.recentHours}h: ${r.recent.faults} failed of ${r.recent.faults + r.recent.completed} finished (${rate})`,
		`Failed, last ${r.windowDays} days: ${r.failures.total}${r.failures.truncated ? "+" : ""} (${counts(r.failures.byKind)})`,
		...list("Newest failures", r.failures.rows, r.failures.total, failedLine),
		`Refused, last ${r.windowDays} days: ${r.refusals.total} from ${r.refusals.accounts} account(s) (${counts(r.refusals.byCode)})`,
		...list(
			"Newest refusals",
			r.refusals.rows,
			r.refusals.total,
			(x) => `${pr(x)}  ${who(x.login)}  ${x.code}  ${when(x.createdAt)}`,
		),
		`Not posted to GitHub: ${r.publishErrors.count}`,
		...list("Unposted", r.publishErrors.rows, r.publishErrors.count, failedLine),
		`Round time over ${d.rounds} rounds: p50 ${duration(d.p50Ms)}, p95 ${duration(d.p95Ms)}; ${d.fallbacks} consolidation fallback(s)`,
		"Add --json for the full report.",
	].join("\n");
}

export function formatRelease(r: AdminRelease): string {
	return [
		r.leaseReleased
			? `Released the lease of ${r.sessionId}.`
			: `Settled ${r.sessionId}; its pull request's lease was not its own, so it was left alone.`,
		`Audit id: ${r.auditId}`,
		`before: ${r.before}`,
		`after: ${r.after}`,
		...(r.followUpStarted ? ["A push that was waiting started its follow-up round."] : []),
		"This cannot be undone.",
	].join("\n");
}
