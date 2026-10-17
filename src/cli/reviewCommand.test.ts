import { expect, test } from "bun:test";
import type { ReviewSnapshot } from "../lib/client";
import { parseArgs } from "./args";
import { exitCodeFor, formatReview, formatTrigger, REVIEW_EXIT } from "./reviewCommand";
import { format } from "./run";

test("the review's text output says what to do next from the payload", () => {
	const review = {
		found: true,
		status: "complete",
		round: 2,
		rounds: { completed: 2, limit: 2, perPr: false, running: false },
		open: { critical: 1, warning: 0, suggestion: 0 },
		gate: { level: "warning", blocking: true, unanswered: ["F1"] },
		findings: [],
		payload: {
			verdict: "blocked",
			blockedBy: ["F1"],
			verdictReason: null,
			nextRound: "cap-reached",
		},
	} as unknown as ReviewSnapshot;
	expect(formatReview(review)).toContain("Verdict: blocked by F1; next round: cap-reached");
	expect(formatReview(review)).toContain(
		"Automatic rounds: 2 of 2; the next push will not be reviewed.",
	);
	expect(formatReview(review)).toContain(
		"Gate: blocking until fixed or answered with /feedback: F1.",
	);
});

test("the round line follows the payload's nextRound, not the count alone", () => {
	const base = {
		found: true,
		status: "complete",
		round: 1,
		rounds: { completed: 1, perPr: false, running: false },
		open: { critical: 0, warning: 0, suggestion: 0 },
		gate: { level: "off", blocking: false, unanswered: [] },
		findings: [],
	};
	const payload = { verdict: "ready", blockedBy: [], verdictReason: null, nextRound: "disabled" };
	const off = { ...base, payload } as unknown as ReviewSnapshot;
	expect(formatReview(off)).toContain(
		"Automatic rounds: no limit; pushes are not reviewed automatically.",
	);
	const capped = { ...base, rounds: { ...base.rounds, limit: 1 } } as unknown as ReviewSnapshot;
	expect(formatReview(capped)).toContain("Automatic rounds: 1 of 1; the limit is reached.");
	// The server's limitReached wins; the count is only the fallback for an older server.
	const told = { ...base, rounds: { ...base.rounds, limit: 1, limitReached: false } };
	expect(formatReview(told as unknown as ReviewSnapshot)).toContain("Automatic rounds: 1 of 1.");
});

const finishedReview = (blocking: boolean, payload?: object) => ({
	status: "finished",
	outcome: "completed",
	sessionId: "s1",
	waitedMs: 0,
	session: {},
	review: {
		found: true,
		gate: { level: "warning", blocking, unanswered: blocking ? ["F1"] : [] },
		payload,
	},
});

test("review --wait exits 4 while the gate blocks, 0 once it passes", () => {
	const { command } = parseArgs("review o/r#7 --wait".split(" "));
	expect(exitCodeFor(command, finishedReview(true))).toBe(REVIEW_EXIT.gateBlocking);
	expect(exitCodeFor(command, finishedReview(false))).toBe(REVIEW_EXIT.done);
	const failed = { ...finishedReview(true), outcome: "failed" };
	expect(exitCodeFor(command, failed)).toBe(REVIEW_EXIT.failed);
	const shown = parseArgs("review o/r#7".split(" ")).command;
	expect(exitCodeFor(shown, finishedReview(true))).toBe(REVIEW_EXIT.done);
});

test("the text output prints the server's nextAction and lists payload.findings by state", () => {
	const review = {
		found: true,
		status: "complete",
		round: 2,
		rounds: { completed: 2, perPr: false, running: false },
		open: { critical: 0, warning: 1, suggestion: 0 },
		gate: { level: "warning", blocking: true, unanswered: ["F1"] },
		findings: [],
		payload: {
			verdict: "blocked",
			blockedBy: ["F1"],
			verdictReason: null,
			nextRound: "will-run-on-push",
			nextAction: { action: "fix", refs: ["F1"], reason: "fix it" },
			findings: [
				{
					id: "f1",
					ref: "F1",
					severity: "warning",
					file: "a.ts",
					line: 3,
					message: "m",
					status: "open",
					state: "open",
					answered: false,
				},
			],
		},
	} as unknown as ReviewSnapshot;
	const text = formatReview(review);
	expect(text).toContain("Next: fix F1 (fix it).");
	expect(text).toContain("F1 [warning] a.ts:3 — m  (open, id f1)");
});

test("the payload's step-back block is a line after Next, with how to turn it off", () => {
	const stepBack = {
		rounds: 4,
		threshold: 3,
		totalFindings: 5,
		findingsAfterRound1: 3,
		reason: "reconsider the approach",
	};
	const review = {
		found: true,
		status: "complete",
		round: 4,
		rounds: { completed: 4, perPr: false, running: false },
		open: { critical: 0, warning: 0, suggestion: 0 },
		gate: { level: "off", blocking: false, unanswered: [] },
		findings: [],
		payload: {
			verdict: "ready",
			blockedBy: [],
			verdictReason: null,
			nextRound: "will-run-on-push",
			nextAction: { action: "done", refs: [], reason: "nothing blocks" },
			stepBack,
		},
	} as unknown as ReviewSnapshot;
	const text = formatReview(review);
	expect(text).toContain(
		"Step back: round 4, 3 of 5 findings first reported after round 1; reconsider the approach.",
	);
	expect(text).toContain("--step-back-after-rounds 0");
	expect(text.indexOf("Next:")).toBeLessThan(text.indexOf("Step back:"));
});

test("without a nextAction (an older server) the text output has no Next line", () => {
	const review = {
		found: true,
		status: "complete",
		round: 1,
		rounds: { completed: 1, perPr: false, running: false },
		open: { critical: 0, warning: 0, suggestion: 0 },
		gate: { level: "off", blocking: false, unanswered: [] },
		findings: [],
		payload: { verdict: "ready", blockedBy: [], verdictReason: null, nextRound: "disabled" },
	} as unknown as ReviewSnapshot;
	expect(formatReview(review)).not.toContain("Next:");
});

test("an older server's review, with no payload.findings, lists the top-level findings by status", () => {
	const review = {
		found: true,
		status: "complete",
		round: 2,
		rounds: { completed: 2, perPr: false, running: false },
		open: { critical: 0, warning: 1, suggestion: 0 },
		gate: { level: "off", blocking: false, unanswered: [] },
		findings: [
			{
				id: "f1",
				ref: "F1",
				severity: "warning",
				file: "a.ts",
				message: "m",
				status: "persisting",
				answered: true,
			},
		],
		payload: { verdict: "blocked", blockedBy: ["F1"], verdictReason: null, nextRound: "disabled" },
	} as unknown as ReviewSnapshot;
	expect(formatReview(review)).toContain("F1 [warning] a.ts — m  (persisting, answered, id f1)");
});

test("ask exits 0 when answered, 1 when it failed, 3 while pending", () => {
	const { command } = parseArgs("ask o/r#7 why".split(" "));
	const question = (status: string) => ({ id: "q1", status, answer: "a", model: "m" });
	expect(exitCodeFor(command, question("answered"))).toBe(REVIEW_EXIT.done);
	expect(exitCodeFor(command, question("failed"))).toBe(REVIEW_EXIT.failed);
	expect(exitCodeFor(command, question("pending"))).toBe(REVIEW_EXIT.timeout);
});

test("repos says when the step-back notice starts, and off for 0", () => {
	const { command } = parseArgs(["repos"]);
	const repo = (stepBackAfterRounds?: number) => ({
		githubFullName: "o/r",
		isActive: true,
		webhookId: "1",
		settings: { autoReview: true, stepBackAfterRounds },
	});
	const text = format(command, [repo(0), repo(4), repo()]).split("\n");
	expect(text[0]).toContain("step back off");
	expect(text[1]).toContain("step back from round 4");
	expect(text[2]).not.toContain("step back");
});

test("a pending answer says what a CLI user can do, without implying a rerun resumes it", () => {
	const { command } = parseArgs("ask o/r#7 why".split(" "));
	const text = format(command, { id: "q1", status: "pending" });
	expect(text).toContain("exit code 3");
	expect(text).toContain("would ask a new question");
	expect(text).toContain("questionId q1");
	expect(text).toContain("GET /api/v1/reviews/ask?id=q1");
});

test("review --trigger says scheduled, or queued when another run holds the pull request", () => {
	const scheduled = { scheduled: true, queued: false, queuedBehind: null };
	expect(formatTrigger("o/r", 7, scheduled as never)).toStartWith("Review scheduled.");
	const queued = { scheduled: true, queued: true, queuedBehind: "review" };
	const text = formatTrigger("o/r", 7, queued as never);
	expect(text).toStartWith("Review queued behind a review round");
	expect(text).not.toContain("scheduled");
	expect(text).toContain("codepanel review o/r#7 --wait");
	expect(formatTrigger("o/r", 7, { ...queued, queuedBehind: "dispute" } as never)).toContain(
		"a dispute run",
	);
});
