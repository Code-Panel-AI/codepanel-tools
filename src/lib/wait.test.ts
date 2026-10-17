import { describe, expect, test } from "bun:test";
import { CodePanelError, type ReviewSnapshot, type ReviewStatus } from "./client";
import { nextDelay, triggerAndWait, type WaitClient, waitForReview } from "./wait";

const TRIGGERED = {
	scheduled: true,
	queued: false,
	queuedBehind: null,
	knownHeadSha: "abc",
	lastReviewedSha: null,
};

const TARGET = { repo: "acme/app", pr: 7 };
const REVIEW = { found: true, open: { critical: 0, warning: 0, suggestion: 0 }, findings: [] };

function status(patch: Partial<ReviewStatus> = {}): ReviewStatus {
	return {
		found: true,
		sessionId: "s1" as ReviewStatus["sessionId"],
		status: "reviewing",
		finished: false,
		outcome: null,
		headSha: "abc",
		lastReviewedSha: null,
		sessionHeadSha: null,
		activity: null,
		error: null,
		errorCode: null,
		nextAction: null,
		publishError: null,
		prState: "open",
		...patch,
	};
}

/** MAX_DELAY_MS in wait.ts: the longest wait between two polls. */
const MAX_POLL_DELAY_MS = 15_000;

const NOT_STARTED = status({
	found: false,
	sessionId: null,
	status: null,
	finished: false,
	headSha: null,
});

/** A scripted client and a fake clock that sleeping advances. */
function harness(script: Array<ReviewStatus | Error>) {
	let clock = 0;
	const sleeps: number[] = [];
	let polls = 0;
	const client: WaitClient & { triggers: number } = {
		triggers: 0,
		getReviewStatus: async () => {
			const next = script[Math.min(polls++, script.length - 1)];
			if (next instanceof Error) throw next;
			return next as ReviewStatus;
		},
		getReview: async () => REVIEW as unknown as ReviewSnapshot,
	};
	return {
		client,
		sleeps,
		polls: () => polls,
		options: {
			now: () => clock,
			sleep: async (ms: number) => {
				sleeps.push(ms);
				clock += ms;
			},
		},
	};
}

describe("waitForReview", () => {
	test("returns the review once the session finishes", async () => {
		const h = harness([
			status(),
			status({ status: "synthesizing" }),
			status({ status: "ready", finished: true, outcome: "completed" }),
		]);
		const result = await waitForReview(h.client, TARGET, h.options);
		expect(result).toMatchObject({ status: "finished", outcome: "completed", sessionId: "s1" });
		if (result.status === "finished") expect(result.review).toEqual(REVIEW as never);
		expect(h.polls()).toBe(3);
	});

	test("a failed round is a finished result with the reason, not an exception", async () => {
		const h = harness([
			status({ status: "failed", finished: true, outcome: "failed", error: "No working key" }),
		]);
		const result = await waitForReview(h.client, TARGET, h.options);
		expect(result).toMatchObject({ status: "finished", outcome: "failed" });
		if (result.status === "finished") expect(result.session.error).toBe("No working key");
	});

	test("backs off while nothing changes and restarts when the review moves", async () => {
		const h = harness([
			status(),
			status(),
			status(),
			status({ status: "synthesizing" }),
			status({ status: "ready", finished: true, outcome: "completed" }),
		]);
		await waitForReview(h.client, TARGET, h.options);
		expect(h.sleeps).toEqual([2000, 3000, 4500, 2000]);
	});

	test("never sleeps past the delay cap", () => {
		let delay = 2000;
		for (let i = 0; i < 20; i++) delay = nextDelay(delay, false);
		expect(delay).toBe(15_000);
	});

	test("times out with an explicit result that says to call again", async () => {
		const h = harness([status()]);
		const result = await waitForReview(h.client, TARGET, { ...h.options, timeoutMs: 20_000 });
		expect(result.status).toBe("timeout");
		if (result.status !== "timeout") return;
		expect(result.waitedMs).toBe(20_000);
		expect(result.session?.status).toBe("reviewing");
		expect(result.message).toContain("call wait_for_review again");
		// The last sleep is trimmed so the wait ends on the deadline.
		expect(h.sleeps.reduce((a, b) => a + b, 0)).toBe(20_000);
	});

	test("answers no_review when nothing starts within the grace period", async () => {
		const h = harness([NOT_STARTED]);
		const result = await waitForReview(h.client, TARGET, { ...h.options, startGraceMs: 10_000 });
		expect(result).toMatchObject({ status: "no_review" });
	});

	test("waits through the grace period for a review that then starts", async () => {
		const h = harness([
			NOT_STARTED,
			NOT_STARTED,
			status({ status: "ready", finished: true, outcome: "completed" }),
		]);
		const result = await waitForReview(h.client, TARGET, { ...h.options, startGraceMs: 60_000 });
		expect(result.status).toBe("finished");
	});

	test("ignores the session that was latest before a trigger", async () => {
		const old = status({
			sessionId: "old" as ReviewStatus["sessionId"],
			status: "ready",
			finished: true,
			outcome: "completed",
		});
		const fresh = status({
			sessionId: "new" as ReviewStatus["sessionId"],
			status: "ready",
			finished: true,
			outcome: "completed",
		});
		const h = harness([old, old, fresh]);
		const result = await waitForReview(h.client, TARGET, { ...h.options, ignoreSessionId: "old" });
		expect(result).toMatchObject({ status: "finished", sessionId: "new" });
		expect(h.polls()).toBe(3);
	});

	test("follows a newer round that replaces the one it was watching", async () => {
		const h = harness([
			status(),
			status({ sessionId: "s2" as ReviewStatus["sessionId"] }),
			status({
				sessionId: "s2" as ReviewStatus["sessionId"],
				status: "ready",
				finished: true,
				outcome: "completed",
			}),
		]);
		const result = await waitForReview(h.client, TARGET, h.options);
		expect(result).toMatchObject({ status: "finished", sessionId: "s2" });
	});

	test("an abort signal ends the wait with an aborted result", async () => {
		const controller = new AbortController();
		const h = harness([status()]);
		const options = {
			...h.options,
			signal: controller.signal,
			sleep: async (ms: number) => {
				h.sleeps.push(ms);
				controller.abort();
			},
		};
		const result = await waitForReview(h.client, TARGET, options);
		expect(result.status).toBe("aborted");
		expect(h.polls()).toBe(1);
	});

	test("rides out a few transient failures but not a bad token", async () => {
		const blip = new CodePanelError(503, "unavailable");
		const ok = status({ status: "ready", finished: true, outcome: "completed" });
		const recovers = harness([blip, new TypeError("fetch failed"), ok]);
		expect((await waitForReview(recovers.client, TARGET, recovers.options)).status).toBe(
			"finished",
		);

		const unauthorized = harness([new CodePanelError(401, "invalid, revoked or expired token")]);
		expect(waitForReview(unauthorized.client, TARGET, unauthorized.options)).rejects.toThrow(
			"invalid, revoked",
		);

		const down = harness([blip]);
		expect(waitForReview(down.client, TARGET, down.options)).rejects.toThrow("unavailable");
	});

	test("reports each poll to the caller", async () => {
		const h = harness([
			status({ activity: "Reviewer 1 reading" }),
			status({ finished: true, outcome: "completed", status: "ready" }),
		]);
		const seen: Array<string | null> = [];
		await waitForReview(h.client, TARGET, { ...h.options, onPoll: (s) => seen.push(s.activity) });
		expect(seen).toEqual(["Reviewer 1 reading", null]);
	});
});

describe("waiting for a specific commit", () => {
	const done = (id: string, reviewed: string | null, patch: Partial<ReviewStatus> = {}) =>
		status({
			sessionId: id as ReviewStatus["sessionId"],
			status: "ready",
			finished: true,
			outcome: "completed",
			lastReviewedSha: reviewed,
			headSha: "bbbbbbb1",
			...patch,
		});

	test("a finished review of the previous commit is not the answer right after a push", async () => {
		const h = harness([
			done("old", "aaaaaaa1"),
			done("old", "aaaaaaa1"),
			status({ sessionId: "new" as ReviewStatus["sessionId"], headSha: "bbbbbbb1" }),
			done("new", "bbbbbbb1"),
		]);
		const result = await waitForReview(h.client, TARGET, { ...h.options, headSha: "bbbbbbb" });
		expect(result).toMatchObject({ status: "finished", sessionId: "new" });
		expect(h.polls()).toBe(4);
	});

	test("says so when only an older commit was ever reviewed", async () => {
		const h = harness([done("old", "aaaaaaa1")]);
		const result = await waitForReview(h.client, TARGET, {
			...h.options,
			headSha: "bbbbbbb1",
			startGraceMs: 5000,
		});
		expect(result.status).toBe("no_review");
		if (result.status === "no_review") expect(result.message).toContain("aaaaaaa1");
	});

	test("accepts an abbreviated sha but never one too short to be unique", async () => {
		const reviewed = done("s", "bbbbbbb1c2d3");
		for (const [wanted, matches] of [
			["bbbbbbb", true],
			["bbbbbbb1c2d3", true],
			["bbbbbbb1c2d3e4f5", true],
			["bbbbbb", false],
		] as const) {
			const h = harness([reviewed]);
			const options = { ...h.options, headSha: wanted, startGraceMs: 1000 };
			const result = await waitForReview(h.client, TARGET, options);
			expect(result.status).toBe(matches ? "finished" : "no_review");
		}
	});

	test("a round that failed after the wait began counts; one that was already over does not", async () => {
		const failed = (id: string) => done(id, null, { status: "failed", outcome: "failed" });
		const already = harness([failed("f1")]);
		const stale = await waitForReview(already.client, TARGET, {
			...already.options,
			headSha: "bbbbbbb",
			startGraceMs: 1000,
		});
		expect(stale.status).toBe("no_review");

		const live = harness([status(), failed("s1")]);
		const fresh = await waitForReview(live.client, TARGET, { ...live.options, headSha: "bbbbbbb" });
		expect(fresh).toMatchObject({ status: "finished", outcome: "failed" });
	});

	test("a failed round is matched on the head its session started at", async () => {
		const failedAt = (id: string, sha: string) =>
			status({
				sessionId: id as ReviewStatus["sessionId"],
				sessionHeadSha: sha,
				headSha: "bbbbbbb1",
			});
		const fail = (s: ReviewStatus) => ({
			...s,
			status: "failed" as const,
			finished: true,
			outcome: "failed" as const,
		});
		// The previous commit's round is running when the wait begins, then fails.
		const old = failedAt("old", "aaaaaaa1");
		const h = harness([old, fail(old)]);
		const options = { ...h.options, headSha: "bbbbbbb", startGraceMs: 5000 };
		expect((await waitForReview(h.client, TARGET, options)).status).toBe("no_review");

		// The new commit's own round is running when the wait begins, then fails.
		const own = failedAt("new", "bbbbbbb1");
		const mine = harness([own, fail(own)]);
		const result = await waitForReview(mine.client, TARGET, {
			...mine.options,
			headSha: "bbbbbbb",
		});
		expect(result).toMatchObject({ status: "finished", outcome: "failed", sessionId: "new" });
	});
});

test("a timeout while queued behind the earlier round says the triggered review never started", async () => {
	const running = status({ sessionId: "r1" as ReviewStatus["sessionId"] });
	const h = harness([running]);
	const client = { ...h.client, triggerReview: async () => TRIGGERED };
	const options = { ...h.options, timeoutMs: 60_000, startGraceMs: 5000 };
	const result = await triggerAndWait(client, TARGET, options);
	expect(result.status).toBe("timeout");
	if (result.status === "timeout") {
		expect(result.message).toContain("queued behind");
		expect(result.message).toContain("r1");
	}
});

test("triggerAndWait waits through a round that was already running, then for the one queued behind it", async () => {
	const running = status({ sessionId: "r1" as ReviewStatus["sessionId"] });
	const over = {
		...running,
		status: "ready" as const,
		finished: true,
		outcome: "completed" as const,
	};
	const queued = { ...over, sessionId: "r2" as ReviewStatus["sessionId"] };
	// r1 runs for far longer than the grace period; r2 appears a poll after it ends.
	const h = harness([...Array(12).fill(running), over, queued]);
	const client = { ...h.client, triggerReview: async () => TRIGGERED };
	const result = await triggerAndWait(client, TARGET, { ...h.options, startGraceMs: 30_000 });
	expect(result).toMatchObject({ status: "finished", sessionId: "r2" });
});

test("triggerAndWait gives up if nothing follows the round that was running", async () => {
	const running = status({ sessionId: "r1" as ReviewStatus["sessionId"] });
	const over = {
		...running,
		status: "ready" as const,
		finished: true,
		outcome: "completed" as const,
	};
	const h = harness([running, running, over]);
	const client = { ...h.client, triggerReview: async () => TRIGGERED };
	const result = await triggerAndWait(client, TARGET, { ...h.options, startGraceMs: 10_000 });
	expect(result.status).toBe("no_review");
});

test("triggerAndWait ignores the review that existed before the trigger", async () => {
	const old = status({
		sessionId: "old" as ReviewStatus["sessionId"],
		status: "ready",
		finished: true,
		outcome: "completed",
	});
	const fresh = { ...old, sessionId: "new" as ReviewStatus["sessionId"] };
	const h = harness([old, old, fresh]);
	let triggered = 0;
	const client = {
		...h.client,
		triggerReview: async () => {
			triggered++;
			return TRIGGERED;
		},
	};
	const result = await triggerAndWait(client, TARGET, h.options);
	expect(triggered).toBe(1);
	expect(result).toMatchObject({ scheduled: true, status: "finished", sessionId: "new" });
});

test("triggerAndWait on a never-reviewed PR gives up after the grace period, not the timeout", async () => {
	const h = harness(Array(40).fill(NOT_STARTED));
	const client = { ...h.client, triggerReview: async () => TRIGGERED };
	const options = { ...h.options, timeoutMs: 600_000, startGraceMs: 10_000 };
	const result = await triggerAndWait(client, TARGET, options);
	expect(result.status).toBe("no_review");
	// The grace period plus at most one poll at the longest delay.
	expect(result.waitedMs).toBeLessThanOrEqual(options.startGraceMs + MAX_POLL_DELAY_MS);
	if (result.status === "no_review") {
		expect(result.message).toStartWith("No review has started for this pull request.");
		expect(result.message).not.toContain("queued behind");
	}
});
