import { describe, expect, test } from "bun:test";
import type { ReviewSnapshot, ReviewStatus } from "./client";
import { waitForReview } from "./wait";
import { createAbsenceMemory } from "./waitMessages";

const TARGET = { repo: "acme/app", pr: 999 };
const GRACE_MS = 60_000;
const REVIEW = { found: true } as unknown as ReviewSnapshot;

function status(patch: Partial<ReviewStatus> = {}): ReviewStatus {
	return {
		found: true,
		sessionId: "s1" as ReviewStatus["sessionId"],
		status: "reviewing",
		finished: false,
		outcome: null,
		headSha: "bbbbbbb1",
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

const NONE = status({
	found: false,
	sessionId: null,
	status: null,
	headSha: null,
});

const FAILED_OTHER_COMMIT = status({
	sessionId: "old" as ReviewStatus["sessionId"],
	status: "failed",
	finished: true,
	outcome: "failed",
	sessionHeadSha: "aaaaaaa1",
	lastReviewedSha: null,
});

/** A fake clock that sleeping advances, shared by several waits like one long-lived process. */
function world(answer: ReviewStatus | ((clock: number) => ReviewStatus)) {
	let clock = 0;
	const client = {
		getReviewStatus: async () => (typeof answer === "function" ? answer(clock) : answer),
		getReview: async () => REVIEW,
	};
	const options = {
		now: () => clock,
		sleep: async (ms: number) => {
			clock += ms;
		},
		absence: createAbsenceMemory(),
	};
	return {
		client,
		options,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

describe("a wait that ends before any review appears", () => {
	test("a short timeout on a pull request with no review does not claim one is running", async () => {
		const w = world(NONE);
		const result = await waitForReview(w.client, TARGET, { ...w.options, timeoutMs: 2000 });
		expect(result.status).toBe("timeout");
		if (result.status !== "timeout") return;
		expect(result.running).toBe(false);
		expect(result.message).toStartWith("No review is running");
		expect(result.message).not.toContain("still");
		expect(result.message).toContain("This pull request has no review yet.");
		expect(result.message).toContain("trigger_review");
	});

	test("the CLI's message names its own commands, not MCP tools", async () => {
		const w = world(NONE);
		const short = await waitForReview(w.client, TARGET, {
			...w.options,
			timeoutMs: 2000,
			startGraceMs: GRACE_MS,
			surface: "cli",
		});
		if (short.status !== "timeout") throw new Error("expected a timeout");
		expect(short.message).toContain("codepanel review acme/app#999 --trigger");
		expect(short.message).toContain("--timeout 60");
		expect(short.message).not.toContain("trigger_review");
		expect(short.message).not.toContain("wait_for_review");

		const final = await waitForReview(w.client, TARGET, {
			...w.options,
			startGraceMs: 1000,
			surface: "cli",
		});
		expect(final.status).toBe("no_review");
		if (final.status === "no_review") {
			expect(final.message).toContain("codepanel review acme/app#999 --trigger");
			expect(final.message).not.toContain("trigger_review");
		}
	});

	test("the MCP no_review message says trigger_review", async () => {
		const w = world(NONE);
		const result = await waitForReview(w.client, TARGET, { ...w.options, startGraceMs: 1000 });
		expect(result.status).toBe("no_review");
		if (result.status === "no_review") {
			expect(result.message).toContain("trigger_review");
			expect(result.message).not.toContain("codepanel review");
		}
	});

	test("short waits made one after another add up to no_review", async () => {
		const w = world(NONE);
		const options = { ...w.options, timeoutMs: 20_000, startGraceMs: GRACE_MS };
		const outcomes: string[] = [];
		for (let call = 0; call < 5; call++) {
			outcomes.push((await waitForReview(w.client, TARGET, options)).status);
			w.advance(1000);
		}
		// The first two calls look for 20s each; the third passes 60s of looking in total.
		expect(outcomes).toEqual(["timeout", "timeout", "no_review", "no_review", "no_review"]);
	});

	test("a review that shows up resets the count", async () => {
		const done = status({ status: "ready", finished: true, outcome: "completed" });
		const w = world((clock) => (clock < 30_000 ? NONE : clock < 100_000 ? done : NONE));
		const options = { ...w.options, timeoutMs: 25_000 };
		expect((await waitForReview(w.client, TARGET, options)).status).toBe("timeout");
		w.advance(10_000);
		expect((await waitForReview(w.client, TARGET, options)).status).toBe("finished");
		// Absent again: the earlier 25s of looking no longer count.
		w.advance(100_000);
		const later = await waitForReview(w.client, TARGET, { ...options, timeoutMs: 40_000 });
		expect(later.status).toBe("timeout");
	});

	test("an absence seen long ago is forgotten", async () => {
		const w = world(NONE);
		const options = { ...w.options, timeoutMs: 50_000 };
		expect((await waitForReview(w.client, TARGET, options)).status).toBe("timeout");
		w.advance(10 * 60_000);
		expect((await waitForReview(w.client, TARGET, options)).status).toBe("timeout");
	});

	test("waits for different commits of one pull request are counted apart", async () => {
		const w = world(NONE);
		const options = { ...w.options, timeoutMs: 50_000 };
		await waitForReview(w.client, TARGET, { ...options, headSha: "aaaaaaa" });
		const other = await waitForReview(w.client, TARGET, { ...options, headSha: "bbbbbbb" });
		expect(other.status).toBe("timeout");
	});
});

describe("a wait for a commit whose only review is another commit's", () => {
	test("a short timeout says no review of the commit is running, not that it is still going", async () => {
		const w = world(FAILED_OTHER_COMMIT);
		const result = await waitForReview(w.client, TARGET, {
			...w.options,
			headSha: "deadbee",
			timeoutMs: 2000,
		});
		expect(result.status).toBe("timeout");
		if (result.status !== "timeout") return;
		expect(result.running).toBe(false);
		expect(result.message).not.toContain("still");
		expect(result.message).toContain("deadbee");
		expect(result.message).toContain("that round failed");
	});

	test("past the grace period it is no_review", async () => {
		const w = world(FAILED_OTHER_COMMIT);
		const result = await waitForReview(w.client, TARGET, {
			...w.options,
			headSha: "deadbee",
			startGraceMs: GRACE_MS,
		});
		expect(result.status).toBe("no_review");
	});
});

describe("a wait that ends while a review is running", () => {
	test("says it is still running, with running: true", async () => {
		const w = world(status());
		const result = await waitForReview(w.client, TARGET, { ...w.options, timeoutMs: 2000 });
		expect(result).toMatchObject({ status: "timeout", running: true });
		if (result.status === "timeout") {
			expect(result.message).toContain("still running");
			expect(result.message).toContain("call wait_for_review again");
		}
	});

	test("the CLI says to rerun the command", async () => {
		const w = world(status());
		const result = await waitForReview(w.client, TARGET, {
			...w.options,
			timeoutMs: 2000,
			surface: "cli",
		});
		if (result.status !== "timeout") throw new Error("expected a timeout");
		expect(result.message).toContain("rerun codepanel review acme/app#999 --wait");
		expect(result.message).not.toContain("wait_for_review");
	});
});
