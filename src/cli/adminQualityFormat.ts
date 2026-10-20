/** `codepanel admin quality`, printed as a summary; --json prints the whole response. */
import type { AdminQuality, AdminVerified } from "../lib/adminClient";

const DATE_TIME_CHARS = 16;
const PERCENT = 100;
/** Models printed; the API returns every one and --json prints them all. */
const LISTED = 10;

const when = (ms: number) => new Date(ms).toISOString().slice(0, DATE_TIME_CHARS).replace("T", " ");
const floor = (n: number, capped: boolean) => `${n}${capped ? "+" : ""}`;
const pct = (n: number) => Math.round(n * PERCENT);

function precision(v: AdminVerified, minSample: number): string {
	if (v.precision === null) return `precision n/a (${v.sample}/${minSample} verdicts)`;
	const interval = v.interval ? ` (${pct(v.interval.low)}-${pct(v.interval.high)}%)` : "";
	return `precision ${pct(v.precision)}%${interval} of ${v.sample}`;
}

function models(q: AdminQuality): string[] {
	const rows = q.models.rows;
	if (rows.length === 0) return ["Models: none"];
	const shown = rows
		.slice(0, LISTED)
		.map(
			(m) =>
				`  ${m.model}  reported ${m.reported}, fixed ${m.fixed}, dismissed ${m.dismissed}, up ${m.up}, down ${m.down}, ${precision(m.verified, q.minSample)}`,
		);
	const more = rows.length > LISTED ? [`  ...and ${rows.length - LISTED} more (--json)`] : [];
	return ["Models:", ...shown, ...more];
}

export function formatQuality(q: AdminQuality): string {
	if (q.asOf === null) {
		return [
			`quality: ${q.status}`,
			"The quality rollup has not run yet (daily at 00:55 UTC).",
		].join("\n");
	}
	const d = q.disputes;
	const l = q.learnings;
	return [
		`quality: ${q.status}`,
		...q.problems.map((p) => `  ${p}`),
		`As of ${when(q.asOf)} UTC, last ${q.days} days, ${q.repos} repos${q.truncated ? " (capped: counts are floors)" : ""}`,
		`Findings: ${floor(q.findings, q.truncated)}, fixed ${q.overall.fixed}, ${precision(q.overall.verified, q.minSample)}`,
		...models(q),
		`Disputes: ${d.opened} from ${d.disputers} agent(s): withdrawn ${d.withdrawn}, upheld ${d.upheld}, revised ${d.revised}, closed ${d.closed}, pending ${d.pending} (${d.waiting} waiting on the account, ${d.stuck} over ${q.stuckHours}h)`,
		`Learnings: ${l.created} added (${l.drafted} drafted), ${l.ratedUp} up, ${l.ratedDown} down, ${l.turnedOff} turned off; ${l.active} of ${l.total} active`,
		"Add --json for the full report.",
	].join("\n");
}
