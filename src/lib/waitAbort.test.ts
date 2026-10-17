import { expect, test } from "bun:test";
import { askAndWait } from "./ask";
import type { Question } from "./client";
import { triggerAndWait, waitForReview } from "./wait";

const TARGET = { repo: "acme/app", pr: 7 };

/** A request that stays in flight until the signal aborts, then rejects like fetch does. */
function hangingUntilAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
			once: true,
		});
	});
}

test("aborting during an in-flight poll ends the wait as aborted, not as an error", async () => {
	const controller = new AbortController();
	const client = {
		getReviewStatus: () => hangingUntilAborted(controller.signal),
		getReview: async () => ({}) as never,
	};
	const waiting = waitForReview(client, TARGET, { signal: controller.signal });
	controller.abort();
	expect(await waiting).toMatchObject({ status: "aborted" });
});

test("aborting while triggerAndWait's first request is in flight ends it as aborted", async () => {
	const controller = new AbortController();
	const client = {
		getReviewStatus: () => hangingUntilAborted(controller.signal),
		getReview: async () => ({}) as never,
		triggerReview: async () => {
			throw new Error("must not trigger once cancelled");
		},
	};
	const waiting = triggerAndWait(client, TARGET, { signal: controller.signal });
	controller.abort();
	expect(await waiting).toMatchObject({ status: "aborted" });
});

test("a request failure without an abort is still an error", async () => {
	const client = {
		getReviewStatus: async () => {
			throw new Error("bad request");
		},
		getReview: async () => ({}) as never,
	};
	expect(waitForReview(client, TARGET, {})).rejects.toThrow("bad request");
});

test("aborting a pending ask poll returns the question as last seen", async () => {
	const controller = new AbortController();
	const pending = { id: "q1", status: "pending" } as unknown as Question;
	const client = {
		ask: async () => pending,
		getQuestion: () => hangingUntilAborted(controller.signal) as Promise<Question>,
	};
	const sleep = async () => {
		controller.abort();
	};
	// Abort lands during the poll after the first sleep ends.
	const result = await askAndWait(
		client,
		{ repo: "a/b", pr: 1, question: "why" },
		{
			signal: controller.signal,
			sleep,
		},
	);
	expect(result).toEqual(pending);
});
