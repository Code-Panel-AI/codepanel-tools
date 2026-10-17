/**
 * Whether a polled status is the review `waitForReview` is waiting for.
 */
import type { ReviewStatus } from "./client";

export interface ClassifyOptions {
	/** Ignore this session: the review that was latest before a trigger. */
	ignoreSessionId?: string | null;
	/** Wait for a review of this commit (a full or abbreviated sha). */
	headSha?: string;
}

const MIN_SHA_PREFIX = 7;

function shaMatches(reviewed: string | null, wanted: string): boolean {
	if (!reviewed || Math.min(reviewed.length, wanted.length) < MIN_SHA_PREFIX) return false;
	return reviewed.startsWith(wanted) || wanted.startsWith(reviewed);
}

export type Verdict = "finished" | "waiting" | "other";

/**
 * Whether `status` is the review being waited for. "other" is a review that
 * was there before (the ignored session, one of an earlier commit) or none at
 * all; "waiting" is a review still running.
 */
export function classify(
	status: ReviewStatus,
	options: ClassifyOptions,
	first: ReviewStatus | null,
): Verdict {
	if (!status.found || status.sessionId === options.ignoreSessionId) return "other";
	if (!status.finished || !status.outcome) return "waiting";
	if (options.headSha === undefined) return "finished";
	const matches =
		status.outcome === "failed"
			? failedRoundMatches(status, options.headSha, first)
			: shaMatches(status.lastReviewedSha, options.headSha);
	return matches ? "finished" : "other";
}

/**
 * A failed round never moves lastReviewedSha, so it is matched on the head
 * its session fetched. One that failed before reading the PR, or predates
 * the field, falls back to the next best evidence: it was not already over
 * when the wait began.
 */
function failedRoundMatches(status: ReviewStatus, wanted: string, first: ReviewStatus | null) {
	if (status.sessionHeadSha) return shaMatches(status.sessionHeadSha, wanted);
	return status.sessionId !== first?.sessionId || !first?.finished;
}
