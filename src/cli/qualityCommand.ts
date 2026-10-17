/**
 * `codepanel quality owner/name [--days n]`: a repository's verified review
 * precision per model and role (GET /api/v1/quality). --json prints every
 * segment; the text form prints the rows an agent or person compares first.
 */
import type { CodePanelClient, Quality } from "../lib/client";
import { repoArg } from "./knowledgeArgs";
import { UsageError } from "./usageError";

export type QualityCommand = { kind: "quality"; repo: string; days?: number };

interface FlagReader {
	flag(name: string): string | undefined;
}

const PERCENT = 100;

export function parseQuality(positionals: string[], r: FlagReader): QualityCommand {
	const days = r.flag("days");
	if (days !== undefined && !/^[1-9]\d*$/.test(days)) {
		throw new UsageError("--days must be a whole number of days");
	}
	return {
		kind: "quality",
		repo: repoArg(positionals[0]),
		days: days === undefined ? undefined : Number(days),
	};
}

export function executeQuality(command: QualityCommand, client: CodePanelClient): Promise<Quality> {
	return client.getQuality(command.repo, command.days);
}

type Row = Quality["overall"];

function line(row: Row): string {
	const v = row.verified;
	const counts = `${v.truePositives.total} TP / ${v.falsePositives.total} FP of ${row.reported}`;
	const precision =
		v.precision === null || v.interval === null
			? `insufficient data (${v.sample} verdicts)`
			: `precision ${Math.round(v.precision * PERCENT)}% [${Math.round(v.interval.low * PERCENT)}-${Math.round(v.interval.high * PERCENT)}%]`;
	return `  ${row.key}: ${precision}, ${counts}; addressed by commit ${row.unverified.addressedByCommit} (unverified)`;
}

export function formatQuality(q: Quality): string {
	const cut = q.truncated ? " (newest findings only: a read cap was hit)" : "";
	return [
		`${q.repo}, last ${q.days} days, ${q.findings} findings${cut}. Precision needs ${q.minSample} verified verdicts.`,
		line(q.overall),
		"By model:",
		...q.byModel.map(line),
		"By role:",
		...q.byRole.map(line),
	].join("\n");
}
