/**
 * The `convergence.loop` block of `codepanel quality`: the author agent's
 * side of the review loop, by the guidance it was given. --json prints every
 * field, the clients included.
 */
import type { Quality } from "../lib/client";

type Loop = NonNullable<Quality["convergence"]["loop"]>;
type Segment = Loop["overall"];

const ONE_DECIMAL = 10;
const KILOBYTE = 1024;

function perRound(value: number | null): string {
	return value === null ? "n/a" : String(Math.round(value * ONE_DECIMAL) / ONE_DECIMAL);
}

function kilobytes(value: number | null): string {
	return value === null ? "n/a" : `${Math.round(value / KILOBYTE)} KB`;
}

function afterServed(segment: Segment): string {
	const rows = segment.afterServed.map((r) => {
		const next = Object.entries(r.next)
			.filter(([, n]) => n > 0)
			.map(([kind, n]) => `${kind} ${n}`);
		return `${r.action} ${r.served} (then ${next.join(", ")})`;
	});
	return rows.length === 0 ? "" : ` Served: ${rows.join("; ")}.`;
}

export function loopSegmentText(segment: Segment): string[] {
	return [
		`  ${segment.key}: ${segment.pullRequests} pull requests, ${segment.rounds} rounds; per round: pushes ${perRound(segment.pushesPerRound)}, calls ${perRound(segment.toolCallsPerRound)}, read ${kilobytes(segment.bytesServedPerRound)}.${afterServed(segment)}`,
	];
}

export function formatLoop(loop: Loop): string[] {
	const cut = loop.truncated ? " (newest pull requests only: a read cap was hit)" : "";
	const left = loop.excluded ? `, ${loop.excluded} busiest left out` : "";
	return [
		`Agent loop by guidance${cut}${left}:`,
		...loopSegmentText(loop.overall),
		...(loop.byGuidance.length > 1 ? loop.byGuidance.flatMap(loopSegmentText) : []),
	];
}
