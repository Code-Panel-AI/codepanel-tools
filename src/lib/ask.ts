/**
 * Ask the reviewers a question and wait for the answer. The POST itself
 * waits a while server-side; when the answer takes longer it comes back
 * pending, and this polls for it, like waitForReview does for a review.
 */
import type { AskArgs, CodePanelClient, Question } from "./client";
import { abortableSleep } from "./wait";

/** An answer is one model call: minutes at the very most. */
export const DEFAULT_ASK_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MS = 3_000;

export interface AskWaitOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
	/** Injected in tests. */
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
}

export type AskClient = Pick<CodePanelClient, "ask" | "getQuestion">;

/** A new question, or the id of one asked earlier that was still pending. */
export type AskRequest = AskArgs | { questionId: string };

/**
 * The question as it stands when answered, failed, or out of time (still
 * pending). Waiting on an earlier question's id asks nothing new, so it
 * spends no model call and none of the pull request's question limit.
 */
export async function askAndWait(
	client: AskClient,
	request: AskRequest,
	options: AskWaitOptions = {},
): Promise<Question> {
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? abortableSleep;
	const until = now() + (options.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS);
	const resumed = "questionId" in request;
	let current = resumed ? await client.getQuestion(request.questionId) : await client.ask(request);
	while (current.status === "pending" && (resumed || request.wait !== false)) {
		const remaining = until - now();
		if (remaining <= 0 || options.signal?.aborted) break;
		await sleep(Math.min(POLL_MS, remaining), options.signal);
		if (options.signal?.aborted) break;
		try {
			current = await client.getQuestion(current.id);
		} catch (error) {
			// Cancelling rejects the in-flight poll; the question as last seen is the answer.
			if (options.signal?.aborted) break;
			throw error;
		}
	}
	return current;
}
