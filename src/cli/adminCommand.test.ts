import { describe, expect, test } from "bun:test";
import type { AdminOverview, AdminRevenue, AdminUserDetail, AdminWrite } from "../lib/adminClient";
import { adminNotice, formatAdmin } from "./adminCommand";

const T = Date.parse("2026-10-01T12:00:00Z");

describe("formatAdmin", () => {
	test("overview lists problems with their area, figures and newest users", () => {
		const overview: AdminOverview = {
			status: "attention",
			problems: [{ area: "treasury", problem: "OpenAI has no balance", path: "/admin/treasury" }],
			figures: {
				days: 7,
				signups: 3,
				reviews: 40,
				failedReviews: 2,
				platformCostUsd: 12.5,
				creditsSoldUsd: 100,
			},
			newestUsers: [{ userId: "u1", login: "octocat", createdAt: T, plan: "paid" }],
		};
		const text = formatAdmin({ kind: "admin.overview" }, overview);
		expect(text).toContain("Status: attention");
		expect(text).toContain("[treasury] OpenAI has no balance");
		expect(text).toContain("Last 7 days: 3 signups, 40 reviews (2 failed)");
		expect(text).toContain("platform cost $12.50, credits sold $100.00");
		expect(text).toContain("octocat  2026-10-01  paid");
	});

	test("a test alert says whether it was delivered, and its audit id", () => {
		const command = { kind: "admin.alertTest", reason: "hook" } as const;
		expect(
			formatAdmin(command, { delivered: true, httpStatus: 204, error: null, auditId: "a1" }),
		).toBe("Delivered (HTTP 204).\nAudit id: a1");
		const failed = {
			delivered: false,
			httpStatus: null,
			error: "The alert webhook refused the alert (HTTP 404)",
			auditId: "a2",
		};
		expect(formatAdmin(command, failed)).toContain("Not delivered: The alert webhook refused");
	});

	test("a report prints status and problems", () => {
		const text = formatAdmin(
			{ kind: "admin.report", report: "models" },
			{ status: "ok", problems: [] },
		);
		expect(text).toContain("models: ok");
	});

	test("balance names the provider, the amount and the new row's id, and survives a bare reply", () => {
		const command = {
			kind: "admin.balance",
			provider: "anthropic",
			amountUsd: 120,
			note: "console",
		} as const;
		const text = formatAdmin(command, { id: "pb_42" });
		expect(text).toContain("anthropic");
		expect(text).toContain("$120.00");
		expect(text).toContain("id pb_42");
		expect(formatAdmin(command, null)).toBe(
			"Recorded the anthropic balance ($120.00). See codepanel admin treasury.",
		);
	});

	test("revenue prints a summary, not JSON", () => {
		const sub = {
			userId: "u2",
			login: "bob",
			status: "past_due",
			currentPeriodEnd: T,
			cancelAtPeriodEnd: false,
			since: T,
		};
		const revenue: AdminRevenue = {
			status: "attention",
			problems: ["1 subscription is past due"],
			windowDays: 30,
			billing: { configured: true, testMode: false, dashboardUrl: "https://dashboard.stripe.com" },
			subscriptions: {
				snapshotAsOf: T,
				figures: {
					mrrUsd: 40,
					active: 1,
					trialing: 0,
					pastDue: 1,
					cancelling: 0,
					started: 2,
					churned: 1,
				},
				truncated: false,
				pastDue: [sub],
				cancelling: [],
				started: [],
				churned: [],
			},
			comps: {
				current: 1,
				lapsed: 0,
				truncated: false,
				rows: [{ login: "carol", reason: "Design partner", until: null, current: true }],
			},
			credits: {
				topups: { checkoutCount: 2, checkoutUsd: 75, autoReloadCount: 1, autoReloadUsd: 25 },
				clawbacks: {
					takenUsd: 25,
					returnedUsd: 0,
					rows: [{ chargeId: "ch_9", login: "alice", takenUsd: 25, returnedUsd: 0, lastAt: T }],
				},
			},
			autoReloadOff: {
				byReason: [{ reason: "card_declined", count: 1 }],
				rows: [{ login: "alice", reason: "card_declined", offAt: T }],
			},
			disputes: { open: 1, rows: [{ login: "bob", charges: 1 }] },
		};
		const text = formatAdmin({ kind: "admin.report", report: "revenue" }, revenue);
		expect(text).toContain("revenue: attention");
		expect(text).toContain("MRR $40.00 at list price (snapshot 2026-10-01)");
		expect(text).toContain("bob  past_due since 2026-10-01");
		expect(text).toContain("2 at Checkout $75.00, 1 by auto-reload $25.00");
		expect(text).toContain("alice  ch_9  $25.00  2026-10-01");
		expect(text).toContain("carol  no end  Design partner");
		expect(text).toContain("alice  card_declined  2026-10-01");
		expect(text).toContain("Open disputes: 1");
		expect(text).not.toContain("{");
	});

	test("users print the next page command", () => {
		const text = formatAdmin(
			{ kind: "admin.users" },
			{
				users: [
					{ userId: "u1", login: "a", createdAt: T, deleting: false, plan: "none", creditsUsd: 0 },
				],
				nextCursor: "c9",
			},
		);
		expect(text).toContain("More: codepanel admin users --cursor c9");
	});

	test("a write prints before, after and the undo command", () => {
		const write: AdminWrite = {
			auditId: "k17",
			applied: true,
			before: { until: null },
			after: { until: "2027-01-31" },
			undo: { path: "/admin/audit/undo" },
		};
		const text = formatAdmin({ kind: "admin.comp", login: "a", reason: "r" }, write);
		expect(text).toContain('before: {"until":null}');
		expect(text).toContain('after: {"until":"2027-01-31"}');
		expect(text).toContain('codepanel admin undo k17 --reason "<why>"');
	});

	test("an undo has nothing to undo, and a repeated credit says nothing changed", () => {
		const write: AdminWrite = { auditId: "k18", applied: false, before: 1, after: 1, undo: null };
		const credit = {
			kind: "admin.credit",
			login: "a",
			amountUsd: 5,
			requestId: "r1",
			reason: "r",
		} as const;
		const text = formatAdmin(credit, write);
		expect(text).toContain("Not applied");
		expect(text).not.toContain("admin undo");
		// Said before the call, so a failed call still leaves the id to retry with.
		expect(adminNotice(credit)).toContain("--request-id r1");
		expect(adminNotice({ kind: "admin.overview" })).toBeUndefined();
	});

	test("a user prints plan, credits, budget, repos and undoable actions", () => {
		const detail: AdminUserDetail = {
			user: {
				userId: "u1",
				login: "octocat",
				createdAt: Date.UTC(2026, 9, 1),
				deleting: false,
				plan: "comp",
				creditsUsd: 7,
			},
			subscription: null,
			comp: { until: null, current: true },
			credits: { allowanceUsd: 2, topupUsd: 5, starterGranted: true },
			budget: { source: "custom", limitUsd: 50, ownKeyUsd: 3.5, platformUsd: 1 },
			repos: [{ fullName: "octo/app", active: true, monthUsd: 4.5 }],
			reposPartial: false,
			audit: [
				{
					id: "k20",
					action: "credits_adjusted",
					operator: "owner",
					targetType: "user",
					targetId: "u1",
					targetLabel: "octocat",
					reason: "refund",
					before: "$0.00",
					after: "$5.00",
					createdAt: Date.UTC(2026, 9, 2),
					undoable: true,
				},
			],
		};
		const text = formatAdmin({ kind: "admin.user", login: "octocat" }, detail);
		expect(text).toContain("octocat  joined 2026-10-01");
		expect(text).toContain("Plan: comp, comp with no end");
		expect(text).toContain("Credits: $5.00 purchased, $2.00 allowance, starter granted");
		expect(text).toContain("Budget: $50.00 (custom)");
		expect(text).toContain("octo/app  $4.50 this month");
		expect(text).toContain('codepanel admin undo k20 --reason "<why>"');
	});
});
