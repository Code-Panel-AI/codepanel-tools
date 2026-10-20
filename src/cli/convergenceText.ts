/**
 * The `convergence` block of `codepanel quality`: how the review loop
 * converges, as the few numbers an author agent or a person compares first.
 * --json prints every segment, pipelines included.
 */
import type { Quality } from "../lib/client";
import { formatLoop } from "./loopText";

type Segment = Quality["convergence"]["overall"];

const PERCENT = 100;

function percent(value: number | null): string {
	return value === null ? "n/a" : `${Math.round(value * PERCENT)}%`;
}

function plain(value: number | null): string {
	return value === null ? "n/a" : String(value);
}

function triggers(segment: Segment): string {
	const rows = segment.afterGreen.byTrigger;
	if (rows.length === 0) return "";
	const parts = rows.map((r) => `${r.trigger} ${r.rounds} (${r.reBlocked} re-blocked)`);
	return ` By what started them: ${parts.join(", ")}.`;
}

function findings(segment: Segment): string {
	return segment.findingsByRound.map((b) => `round ${b.round}: ${b.findings}`).join(", ");
}

export function segmentText(segment: Segment): string[] {
	const { rounds, firstGreen, afterGreen } = segment;
	return [
		`  ${segment.key}: ${segment.pullRequests} merged pull requests, rounds mean ${plain(rounds.mean)}, p90 ${plain(rounds.p90)}, 5 or more ${percent(rounds.fiveOrMore)}.`,
		`    Gate green after round 1: ${percent(firstGreen.afterRound1)}; mean rounds to first green ${plain(firstGreen.meanRounds)}; never green ${firstGreen.never}.`,
		`    Rounds after green: ${afterGreen.rounds} (${percent(afterGreen.shareOfRounds)} of all rounds), re-blocked ${percent(afterGreen.reBlockedShare)}.${triggers(segment)}`,
		`    Findings first seen by round: ${findings(segment)}.`,
	];
}

export function formatConvergence(c: Quality["convergence"]): string[] {
	const cut = c.truncated ? " (newest pull requests only: a read cap was hit)" : "";
	const thin = c.overall.insufficientData
		? ` Fewer than ${c.minPullRequests} pull requests: read these as examples.`
		: "";
	return [
		`Convergence, ${c.pullRequests} pull requests merged in the window${cut}.${thin}`,
		...segmentText(c.overall),
		...(c.byPipeline.length > 1 ? ["By pipeline:", ...c.byPipeline.flatMap(segmentText)] : []),
		...(c.loop ? formatLoop(c.loop) : []),
	];
}
