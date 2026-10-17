/**
 * What `waitForReview` tells the caller when it stops without a finished
 * review, and the memory that lets repeated short waits add up.
 *
 * Two surfaces read these messages: the MCP tool (an agent calls
 * `wait_for_review` / `trigger_review`) and the CLI (a person or script runs
 * `codepanel review --wait` / `--trigger`). Each message names the next
 * action in that surface's own words.
 */
import type { ReviewStatus } from "./client";

export type WaitSurface = "mcp" | "cli";

/** How long to wait for a review to appear before concluding there is none. */
export const DEFAULT_START_GRACE_MS = 60_000;
/** Absence seen longer ago than this is forgotten; the situation has likely changed. */
const ABSENCE_MEMORY_MS = 5 * 60_000;
const MS = 1000;

interface Target {
	repo: string;
	pr: number;
}

interface MessageOptions {
	surface?: WaitSurface;
	headSha?: string;
	ignoreSessionId?: string | null;
}

/**
 * When a wait first found nothing it was waiting for, per pull request and
 * commit. An agent whose client cancels long calls passes a short
 * `timeoutSeconds` and calls again; each call is a new wait, so without this
 * the grace period would restart every time and `no_review` could never come.
 */
export interface AbsenceMemory {
	/** When the absence began, if it was seen recently. */
	since(key: string, now: number): number | undefined;
	/** Record that nothing was found at `now`; keeps the earliest time of a run of absences. */
	note(key: string, now: number): void;
	forget(key: string): void;
	/** Forget everything, as between tests. */
	clear(): void;
}

export function createAbsenceMemory(): AbsenceMemory {
	const seen = new Map<string, { since: number; last: number }>();
	return {
		since(key, now) {
			const entry = seen.get(key);
			if (!entry) return undefined;
			if (now - entry.last > ABSENCE_MEMORY_MS) {
				seen.delete(key);
				return undefined;
			}
			return entry.since;
		},
		note(key, now) {
			const entry = seen.get(key);
			const fresh = entry && now - entry.last <= ABSENCE_MEMORY_MS;
			seen.set(key, { since: fresh ? entry.since : now, last: now });
		},
		forget: (key) => void seen.delete(key),
		clear: () => seen.clear(),
	};
}

/**
 * The default, for the whole process: a stdio MCP server serves one client,
 * and an absence of a review is a fact about the pull request, not about
 * whoever asked. Tests reset it (test/preload.ts).
 */
export const sharedAbsenceMemory = createAbsenceMemory();

export function absenceKey(target: Target, headSha?: string): string {
	return `${target.repo}#${target.pr}@${headSha ?? ""}`;
}

const seconds = (ms: number) => Math.round(ms / MS);

/** The command that starts a review, in the caller's own interface. */
export function triggerCommand(target: Target, surface: WaitSurface = "mcp"): string {
	return surface === "cli"
		? `codepanel review ${target.repo}#${target.pr} --trigger`
		: "trigger_review";
}

function waitAgain(target: Target, surface: WaitSurface = "mcp"): string {
	return surface === "cli"
		? `rerun codepanel review ${target.repo}#${target.pr} --wait`
		: "call wait_for_review again";
}

/** Why the wait stopped while a review was running (or about to run behind one). */
export function describeRunningTimeout(
	target: Target,
	options: MessageOptions,
	last: ReviewStatus | null,
	queuedBehind: boolean,
	waitedMs: number,
): string {
	const surface = options.surface ?? "mcp";
	if (queuedBehind) {
		const inspect =
			surface === "cli"
				? `check that round with codepanel session ${last?.sessionId ?? "<id>"}`
				: "check that round with get_session";
		return `The triggered review had not started after ${seconds(waitedMs)}s: it is queued behind the round that was already running (session ${last?.sessionId ?? "unknown"}, last status ${last?.status ?? "unknown"}), which has not finished. ${capitalize(waitAgain(target, surface))}, or ${inspect}.`;
	}
	if (!last) {
		return `No status came back from the server in ${seconds(waitedMs)}s, so it is not known whether a review is running. ${capitalize(waitAgain(target, surface))}.`;
	}
	const where = last.status ? ` Last status: ${last.status}.` : "";
	return `The review had not finished after ${seconds(waitedMs)}s.${where} It is still running: ${waitAgain(target, surface)}.`;
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the latest review is, when it is not the one being waited for. */
function whatExists(status: ReviewStatus, options: MessageOptions): string {
	if (!status.found) return "This pull request has no review yet.";
	if (options.ignoreSessionId && status.sessionId === options.ignoreSessionId) {
		return "The latest review is the one that existed before the trigger.";
	}
	const failed = status.outcome === "failed" ? " (that round failed)" : "";
	if (options.headSha && status.lastReviewedSha) {
		return `The latest finished review is of ${status.lastReviewedSha}${failed}.`;
	}
	return `The latest review is of an earlier commit${failed}.`;
}

/**
 * Nothing that counts is running. Once the start grace has passed this is
 * final (`no_review`): trigger one. Before that a review may still be about
 * to appear (a push takes a few seconds to reach CodePanel), so the message
 * says nothing is running yet and what the next call does, rather than
 * claiming one is in progress.
 */
export function describeNotStarted(
	target: Target,
	options: MessageOptions,
	status: ReviewStatus,
	graceMs: number,
	waitedMs: number | null,
): string {
	const surface = options.surface ?? "mcp";
	const subject = options.headSha ? `review of ${options.headSha}` : "review";
	const started = options.headSha
		? `No review of ${options.headSha} has started`
		: "No review has started for this pull request";
	const trigger = triggerCommand(target, surface);
	const exists = whatExists(status, options);
	if (waitedMs === null) {
		return `${started}. ${exists} Check the push reached GitHub and auto-review is on, or trigger one with ${trigger}.`;
	}
	const next =
		surface === "cli"
			? `Pass --timeout ${seconds(graceMs)} or more to find out whether one starts, or trigger one with ${trigger}.`
			: `Calls made one after another count together: after ${seconds(graceMs)}s with none started, wait_for_review answers no_review. Or trigger one with ${trigger}.`;
	return `No ${subject} is running: it has not started after ${seconds(waitedMs)}s (one can take up to ${seconds(graceMs)}s to appear after a push). ${exists} ${next}`;
}
