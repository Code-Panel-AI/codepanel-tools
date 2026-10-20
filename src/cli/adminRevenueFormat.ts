/** `codepanel admin revenue`, printed as a summary; --json prints the whole response. */
import type { AdminRevenue } from "../lib/adminClient";

const DATE_CHARS = 10;
/** Accounts printed per list; the API returns more and --json prints them all. */
const LISTED = 5;

const day = (ms: number) => new Date(ms).toISOString().slice(0, DATE_CHARS);
const usd = (n: number) => `$${n.toFixed(2)}`;
const who = (login: string | null) => login ?? "(unknown)";

function list<T>(title: string, rows: T[], line: (row: T) => string): string[] {
	if (rows.length === 0) return [];
	const more = rows.length > LISTED ? [`  ...and ${rows.length - LISTED} more (--json)`] : [];
	return [`${title}:`, ...rows.slice(0, LISTED).map((r) => `  ${line(r)}`), ...more];
}

function subscriptionLines(r: AdminRevenue): string[] {
	const s = r.subscriptions;
	const f = s.figures;
	const asOf = s.snapshotAsOf === null ? "no snapshot yet" : `snapshot ${day(s.snapshotAsOf)}`;
	return [
		`MRR ${usd(f.mrrUsd)}${s.truncated ? " at least (too many rows to count)" : ""} at list price (${asOf})`,
		`Subscriptions: ${f.active} active, ${f.trialing} trialing, ${f.pastDue} past due or unpaid, ${f.cancelling} cancelling; last ${r.windowDays} days ${f.started} new, ${f.churned} ended`,
		...list("Past due", s.pastDue, (p) => `${who(p.login)}  ${p.status} since ${day(p.since)}`),
		...list("Cancelling", s.cancelling, (c) => `${who(c.login)}  ends ${day(c.since)}`),
	];
}

function creditLines(r: AdminRevenue): string[] {
	const t = r.credits.topups;
	const c = r.credits.clawbacks;
	return [
		`Top-ups, last ${r.windowDays} days: ${t.checkoutCount} at Checkout ${usd(t.checkoutUsd)}, ${t.autoReloadCount} by auto-reload ${usd(t.autoReloadUsd)}`,
		`Clawbacks: ${usd(c.takenUsd)} taken back, ${usd(c.returnedUsd)} returned`,
		...list(
			"Clawed back",
			c.rows,
			(row) =>
				`${who(row.login)}  ${row.chargeId ?? "(unknown charge)"}  ${usd(row.takenUsd)}  ${day(row.lastAt)}`,
		),
	];
}

function riskLines(r: AdminRevenue): string[] {
	const comps = r.comps;
	return [
		`Comps: ${comps.current} current, ${comps.lapsed} lapsed`,
		...list(
			"Comped",
			comps.rows.filter((c) => c.current),
			(c) =>
				`${who(c.login)}  ${c.until === null ? "no end" : `until ${day(c.until)}`}  ${c.reason}`,
		),
		...list(
			"Auto-reload off",
			r.autoReloadOff.rows,
			(o) => `${who(o.login)}  ${o.reason}  ${day(o.offAt)}`,
		),
		`Open disputes: ${r.disputes.open}`,
		...list("Disputed", r.disputes.rows, (d) => `${who(d.login)}  ${d.charges} charge(s)`),
	];
}

export function formatRevenue(r: AdminRevenue): string {
	const billing = r.billing.configured
		? []
		: ["Billing is off on this deployment: nothing is charged."];
	return [
		`revenue: ${r.status}`,
		...billing,
		...r.problems.map((p) => `  ${p}`),
		...subscriptionLines(r),
		...creditLines(r),
		...riskLines(r),
		`Refund, dispute and tax amounts: ${r.billing.dashboardUrl}`,
		"Add --json for the full report.",
	].join("\n");
}
