/** `codepanel admin evals`, printed as a summary; --json prints the whole response. */
import type { AdminEvals, AdminEvalWorkflow } from "../lib/adminClient";

const DATE_TIME_CHARS = 16;
const when = (ms: number) => new Date(ms).toISOString().slice(0, DATE_TIME_CHARS).replace("T", " ");

function workflowLines(w: AdminEvalWorkflow): string[] {
	const head = `${w.label} (${w.file}, ${w.cadence})`;
	if (!w.read) {
		return [
			`${head}: unreadable (${w.httpStatus === null ? "no answer" : `HTTP ${w.httpStatus}`})`,
		];
	}
	const [last] = w.runs;
	if (!last) return [`${head}: no runs`];
	const result = last.status === "completed" ? (last.conclusion ?? "completed") : last.status;
	return [`${head}: ${result}, ${when(last.createdAt)} UTC, ${last.event}`, `  ${last.url}`];
}

export function formatEvals(e: AdminEvals): string {
	const envelope = `Envelope: run \`${e.envelope.command}\` (${e.envelope.note})`;
	if (!e.configured) {
		return [
			`evals: ${e.status}`,
			`GitHub Actions status is off: set ${e.tokenEnv} (Actions: read on ${e.repo}) to see it here.`,
			`Runs: ${e.actionsUrl}`,
			envelope,
		].join("\n");
	}
	return [
		`evals: ${e.status}`,
		...e.problems.map((p) => `  ${p}`),
		...e.workflows.flatMap(workflowLines),
		envelope,
		"Add --json for the full report.",
	].join("\n");
}
