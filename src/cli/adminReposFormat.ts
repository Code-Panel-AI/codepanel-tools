/** `codepanel admin repos`, printed as a summary; --json prints the whole response. */
import type { AdminRepos } from "../lib/adminClient";

const DATE_TIME_CHARS = 16;
/** Rows printed per list; the API returns more and --json prints them all. */
const LISTED = 5;

const when = (ms: number) => new Date(ms).toISOString().slice(0, DATE_TIME_CHARS).replace("T", " ");
const floor = (n: number, capped: boolean) => `${n}${capped ? "+" : ""}`;

function list<T>(title: string, rows: T[], total: number, line: (row: T) => string): string[] {
	if (rows.length === 0) return [];
	const shown = rows.slice(0, LISTED);
	const more = total > shown.length ? [`  ...and ${total - shown.length} more (--json)`] : [];
	return [`${title}:`, ...shown.map((r) => `  ${line(r)}`), ...more];
}

export function formatRepos(r: AdminRepos): string {
	const { counts, statusRefused: refused, installations } = r;
	const health = counts.byHealth.map((h) => `${h.health} ${h.count}`).join(", ");
	return [
		`repos: ${r.status}`,
		...r.problems.map((p) => `  ${p}`),
		`Repositories: ${floor(counts.total, counts.truncated)} (${health})`,
		`Commit status refused: ${floor(refused.count, refused.truncated)}`,
		...list(
			"Refused",
			refused.rows,
			refused.count,
			(x) =>
				`${x.repo}  ${x.login ?? "(unknown)"}  ${x.state}${x.httpStatus === null ? "" : ` HTTP ${x.httpStatus}`} since ${when(x.since)}`,
		),
		`GitHub App installations: ${floor(installations.count, installations.truncated)}`,
		...list(
			"Installations",
			installations.rows,
			installations.count,
			(x) => `${x.installationId}  ${x.owner}  ${x.repoCount} repo(s)`,
		),
		"Add --json for the full report.",
	].join("\n");
}
