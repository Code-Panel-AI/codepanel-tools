/**
 * Waiting for a review to finish, client-side, on top of GET /reviews/status.
 *
 * Shared by the MCP tool `wait_for_review` and `codepanel review --wait`, so
 * an agent makes one call instead of polling. The answer is a value, never an
 * exception: a timeout, a pull request nobody has reviewed, and a cancelled
 * wait each have their own status, so the caller knows whether to call again.
 */
import {
	type CodePanelClient,
	CodePanelError,
	type ReviewSnapshot,
	type ReviewStatus,
	type TriggerArgs,
	type TriggerResult,
} from "./client";
import { classify, type Verdict } from "./waitClassify";
import {
	type AbsenceMemory,
	absenceKey,
	createAbsenceMemory,
	DEFAULT_START_GRACE_MS,
	describeNotStarted,
	describeRunningTimeout,
	sharedAbsenceMemory,
	type WaitSurface,
} from "./waitMessages";

export type { WaitSurface } from "./waitMessages";

export const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const INITIAL_DELAY_MS = 2000;
const MAX_DELAY_MS = 15_000;
const BACKOFF_FACTOR = 1.5;
/** Consecutive failed polls (network, 5xx, 429) tolerated before giving up. */
const MAX_TRANSIENT_FAILURES = 5;
const SERVER_ERROR = 500;
const TOO_MANY_REQUESTS = 429;

export type WaitClient = Pick<CodePanelClient, "getReviewStatus" | "getReview">;

export type WaitResult =
	| {
			status: "finished";
			/**
			 * `failed` means the review round errored; `session.error` says why, and for
			 * a refusal `session.errorCode` and `session.nextAction` say what to do.
			 */
			outcome: "completed" | "failed";
			sessionId: string;
			waitedMs: number;
			session: ReviewStatus;
			/** Same shape as get_review. */
			review: ReviewSnapshot;
	  }
	| {
			status: "timeout";
			waitedMs: number;
			/** The latest status seen, or null if the server never answered. */
			session: ReviewStatus | null;
			/**
			 * Whether a review is running or queued, so calling again is waiting for
			 * it. False: nothing that counts is running yet (a review that may still
			 * appear after a push); `message` says what to do, and repeated waits
			 * end in `no_review` once the start grace has passed.
			 */
			running: boolean;
			message: string;
	  }
	| { status: "no_review"; waitedMs: number; message: string }
	| { status: "aborted"; waitedMs: number };

/** The trigger's answer with the wait's, or just "aborted" when cancelled before the trigger went through. */
export type TriggerWaitResult =
	| (TriggerResult & WaitResult)
	| Extract<WaitResult, { status: "aborted" }>;

export interface WaitOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
	/** Ignore this session: the review that was latest before a trigger. */
	ignoreSessionId?: string | null;
	/**
	 * Wait for a review of this commit (a full or abbreviated sha). Without it
	 * the latest finished review counts, which right after a push can still be
	 * the previous commit's.
	 */
	headSha?: string;
	/** Give up on a review ever appearing after this long. */
	startGraceMs?: number;
	/** Whose words the messages use for the next action. Default: the MCP tool. */
	surface?: WaitSurface;
	/** Where repeated waits remember how long nothing has been found. Injected in tests. */
	absence?: AbsenceMemory;
	/** Called after each poll, e.g. to show progress. */
	onPoll?: (status: ReviewStatus, waitedMs: number) => void;
	/** Injected in tests. */
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
}

/** Sleep that ends early, quietly, when the signal aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const done = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal?.addEventListener("abort", done, { once: true });
	});
}

function isTransient(error: unknown): boolean {
	if (error instanceof CodePanelError) {
		return error.status >= SERVER_ERROR || error.status === TOO_MANY_REQUESTS;
	}
	// fetch rejects with a TypeError when the network is down.
	return error instanceof TypeError;
}

/** The next poll delay: grows while nothing changes, restarts when the review moves. */
export function nextDelay(current: number, changed: boolean): number {
	return changed ? INITIAL_DELAY_MS : Math.min(Math.round(current * BACKOFF_FACTOR), MAX_DELAY_MS);
}

interface Progress {
	/** When the give-up clock for "no review started" began; restarts while a prior round runs. */
	graceFrom: number;
	/** The last poll showed the pre-trigger round still running, so the triggered one has not started. */
	queuedBehind: boolean;
	first: ReviewStatus | null;
	last: ReviewStatus | null;
	/** What the latest poll found: the review waited for, one still running, or nothing that counts. */
	verdict: Verdict | null;
	delay: number;
	failures: number;
}

/** One poll. A transient failure (network, 5xx, 429) is absorbed up to a limit; anything else throws. */
async function pollOnce(
	client: WaitClient,
	target: { repo: string; pr: number },
	progress: Progress,
	signal?: AbortSignal,
): Promise<ReviewStatus | null> {
	try {
		const status = await client.getReviewStatus(target.repo, target.pr);
		progress.failures = 0;
		return status;
	} catch (error) {
		// Cancelling rejects the in-flight request; the caller turns that into "aborted".
		if (signal?.aborted) return null;
		if (!isTransient(error) || ++progress.failures > MAX_TRANSIENT_FAILURES) throw error;
		return null;
	}
}

interface Wait {
	client: WaitClient;
	target: { repo: string; pr: number };
	options: WaitOptions;
	progress: Progress;
	graceMs: number;
	started: number;
	now: () => number;
	memory: AbsenceMemory;
	key: string;
}

/** The result for a poll that found the review, or one that can no longer be expected; otherwise null. */
async function observe(w: Wait, status: ReviewStatus): Promise<WaitResult | null> {
	const { client, target, options, progress, now } = w;
	progress.first ??= status;
	options.onPoll?.(status, now() - w.started);
	const verdict = classify(status, options, progress.first);
	progress.verdict = verdict;
	if (verdict === "finished") {
		w.memory.forget(w.key);
		const review = await client.getReview(target.repo, target.pr).catch((error: unknown) => {
			if (options.signal?.aborted) return null;
			throw error;
		});
		if (!review) return { status: "aborted", waitedMs: now() - w.started };
		return {
			status: "finished",
			outcome: status.outcome ?? "completed",
			sessionId: status.sessionId ?? "",
			waitedMs: now() - w.started,
			session: status,
			review,
		};
	}
	// While the round that was running before a trigger is still going, the
	// triggered one is queued behind it: keep waiting, and give it the grace period from when that round ends.
	// A PR with no review yet has no session on either side; null matching null is not a queue.
	progress.queuedBehind =
		status.sessionId !== null && status.sessionId === options.ignoreSessionId && !status.finished;
	if (progress.queuedBehind) progress.graceFrom = now();
	if (verdict === "other" && !progress.queuedBehind) w.memory.note(w.key, now());
	else w.memory.forget(w.key);
	if (verdict === "other" && now() - progress.graceFrom >= w.graceMs) {
		const message = describeNotStarted(w.target, options, status, w.graceMs, null);
		return { status: "no_review", waitedMs: now() - w.started, message };
	}
	const moved =
		status.sessionId !== progress.last?.sessionId || status.status !== progress.last?.status;
	progress.delay = nextDelay(progress.delay, moved);
	progress.last = status;
	return null;
}

/**
 * The wait ran out. Say whether a review is running; when nothing that counts
 * is, never claim one is, since an agent would call again forever.
 */
function timeoutResult(w: Wait): WaitResult {
	const { progress, options } = w;
	const waited = w.now() - w.started;
	const last = progress.last;
	const running = progress.queuedBehind || progress.verdict === "waiting";
	const message =
		last && !running
			? describeNotStarted(w.target, options, last, w.graceMs, w.now() - progress.graceFrom)
			: describeRunningTimeout(w.target, options, last, progress.queuedBehind, waited);
	return { status: "timeout", waitedMs: waited, session: last, running, message };
}

export async function waitForReview(
	client: WaitClient,
	target: { repo: string; pr: number },
	options: WaitOptions = {},
): Promise<WaitResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
	const sleep = options.sleep ?? abortableSleep;
	const now = options.now ?? Date.now;
	const started = now();
	const memory = options.absence ?? sharedAbsenceMemory;
	const key = absenceKey(target, options.headSha);
	const progress: Progress = {
		// Earlier waits for this same review that found nothing count towards the grace.
		graceFrom: memory.since(key, started) ?? started,
		queuedBehind: false,
		first: null,
		last: null,
		verdict: null,
		delay: INITIAL_DELAY_MS,
		failures: 0,
	};
	const w: Wait = {
		client,
		target,
		options,
		progress,
		graceMs: options.startGraceMs ?? DEFAULT_START_GRACE_MS,
		started,
		now,
		memory,
		key,
	};

	for (;;) {
		if (options.signal?.aborted) return { status: "aborted", waitedMs: now() - started };

		const status = await pollOnce(client, target, progress, options.signal);
		if (!status && options.signal?.aborted) return { status: "aborted", waitedMs: now() - started };
		if (status) {
			const result = await observe(w, status);
			if (result) return result;
		} else {
			progress.delay = nextDelay(progress.delay, false);
		}

		const remaining = timeoutMs - (now() - started);
		if (remaining <= 0) return timeoutResult(w);
		await sleep(Math.min(progress.delay, remaining), options.signal);
	}
}

/**
 * Trigger a review and wait for the new one. The session that was latest
 * before the trigger is ignored, so a review that finished earlier is not
 * mistaken for this one. If a round was already running, the triggered one is
 * queued behind it (`rerunRequested`, convex/reviews/lease.ts), so the wait covers both.
 */
export async function triggerAndWait(
	client: WaitClient & Pick<CodePanelClient, "triggerReview">,
	args: TriggerArgs,
	options: WaitOptions = {},
): Promise<TriggerWaitResult> {
	const now = options.now ?? Date.now;
	const started = now();
	let before: ReviewStatus;
	let triggered: TriggerResult;
	try {
		before = await client.getReviewStatus(args.repo, args.pr);
		triggered = await client.triggerReview(args);
	} catch (error) {
		// Cancelling rejects the in-flight request; nothing is known to have been triggered.
		if (options.signal?.aborted) return { status: "aborted", waitedMs: now() - started };
		throw error;
	}
	// A trigger starts a new review, so absences seen before it do not count.
	const result = await waitForReview(client, args, {
		...options,
		absence: options.absence ?? createAbsenceMemory(),
		ignoreSessionId: before.sessionId,
	});
	return { ...triggered, ...result };
}
