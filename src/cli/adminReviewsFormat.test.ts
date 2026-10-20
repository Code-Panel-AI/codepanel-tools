import { describe, expect, test } from "bun:test";
import type { AdminRelease, AdminReviewRound, AdminReviews } from "../lib/adminClient";
import { formatAdmin } from "./adminCommand";

const T = Date.parse("2026-10-18T12:00:00Z");

const round = (fields: Partial<AdminReviewRound>): AdminReviewRound => ({
	sessionId: "s1",
	login: "octocat",
	repo: "acme/web",
	prNumber: 12,
	prUrl: "https://github.com/acme/web/pull/12",
	status: "reviewing",
	kind: null,
	round: 2,
	createdAt: T,
	completedAt: null,
	leased: true,
	stuck: false,
	costUsd: null,
	...fields,
});

const reviews: AdminReviews = {
	status: "attention",
	problems: ["1 review is stuck past the 12-minute lease"],
	windowDays: 7,
	recentHours: 24,
	leaseMinutes: 12,
	running: {
		count: 2,
		stuck: 1,
		truncated: false,
		rows: [round({ stuck: true }), round({ sessionId: "s2" })],
	},
	recent: { faults: 1, completed: 9, failureRate: 0.1, truncated: false },
	failures: {
		total: 2,
		truncated: false,
		byKind: [
			{ code: "timed_out", count: 1 },
			{ code: "plan_limit", count: 1 },
		],
		recentByKind: [{ code: "timed_out", count: 1 }],
		rows: [round({ sessionId: "s3", status: "failed", kind: "timed_out", completedAt: T })],
	},
	publishErrors: { count: 0, truncated: false, rows: [] },
	refusals: {
		total: 1,
		accounts: 1,
		truncated: false,
		byCode: [{ code: "plan_required", count: 1 }],
		rows: [
			{
				login: "bob",
				repo: "bob/app",
				prNumber: 3,
				prUrl: null,
				code: "plan_required",
				createdAt: T,
			},
		],
	},
	durations: { rounds: 9, p50Ms: 185_000, p95Ms: 420_000, fallbacks: 1, truncated: false },
};

describe("admin reviews output", () => {
	test("reviews prints a summary with the release command for a stuck round", () => {
		const text = formatAdmin({ kind: "admin.report", report: "reviews" }, reviews);
		expect(text).toContain("reviews: attention");
		expect(text).toContain("  1 review is stuck past the 12-minute lease");
		expect(text).toContain(
			'acme/web#12  octocat  STUCK since 2026-10-18 12:00  (codepanel admin release s1 --reason "<why>")',
		);
		expect(text).toContain("Last 24h: 1 failed of 10 finished (10%)");
		expect(text).toContain("Failed, last 7 days: 2 (timed_out 1, plan_limit 1)");
		expect(text).toContain("Refused, last 7 days: 1 from 1 account(s) (plan_required 1)");
		expect(text).toContain("p50 3m05s, p95 7m00s; 1 consolidation fallback(s)");
	});

	test("a release says what changed and that it cannot be undone", () => {
		const released: AdminRelease = {
			auditId: "a1",
			sessionId: "s1",
			outcome: "timed_out",
			before: "reviewing since 2026-10-18T12:00:00.000Z",
			after: "failed: Review timed out",
			leaseReleased: true,
			followUpStarted: true,
			undoable: false,
			undo: null,
		};
		const text = formatAdmin({ kind: "admin.release", sessionId: "s1", reason: "stuck" }, released);
		expect(text).toContain("Audit id: a1");
		expect(text).toContain("after: failed: Review timed out");
		expect(text).toContain("follow-up round");
		expect(text).toContain("This cannot be undone.");
		expect(text).not.toContain("codepanel admin undo");
		const notHeld = formatAdmin(
			{ kind: "admin.release", sessionId: "s1", reason: "stuck" },
			{ ...released, leaseReleased: false, followUpStarted: false },
		);
		expect(notHeld).toContain("was not its own, so it was left alone");
		expect(notHeld).not.toContain("Released the lease");
	});
});
