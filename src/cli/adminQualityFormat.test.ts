import { describe, expect, test } from "bun:test";
import type { AdminQuality, AdminVerified } from "../lib/adminClient";
import { formatAdmin } from "./adminCommand";

const T = Date.parse("2026-10-18T00:55:00Z");
const command = { kind: "admin.report", report: "quality" } as const;

const scored: AdminVerified = {
	truePositives: 18,
	falsePositives: 7,
	sample: 25,
	precision: 0.72,
	interval: { low: 0.524, high: 0.857 },
};
const unscored: AdminVerified = {
	truePositives: 2,
	falsePositives: 1,
	sample: 3,
	precision: null,
	interval: null,
};

const model = (name: string, verified: AdminVerified) => ({
	model: name,
	provider: name.split("/")[0] ?? "",
	modelId: name.split("/")[1] ?? name,
	reported: 30,
	fixed: 12,
	dismissed: 4,
	dismissedByReason: { false_positive: 3, duplicate: 1 },
	up: 9,
	down: 5,
	upFromAgents: 2,
	downFromAgents: 1,
	verified,
});

const quality: AdminQuality = {
	status: "attention",
	problems: ["1 dispute was pending over 1 hour with no answer from the orchestrator"],
	asOf: T,
	days: 30,
	since: T - 30 * 86_400_000,
	repos: 4,
	findings: 41,
	unattributed: 0,
	truncated: false,
	minSample: 20,
	stuckHours: 1,
	overall: { reported: 41, fixed: 15, verified: scored },
	models: {
		rows: [model("openai/gpt-x", scored), model("acme/small", unscored)],
		truncated: false,
	},
	disputes: {
		opened: 6,
		disputers: 2,
		withdrawn: 2,
		upheld: 1,
		revised: 1,
		closed: 0,
		pending: 2,
		waiting: 1,
		stuck: 1,
	},
	learnings: {
		created: 3,
		drafted: 1,
		ratedUp: 4,
		ratedDown: 1,
		turnedOff: 1,
		active: 2,
		total: 5,
	},
};

describe("admin quality format", () => {
	test("prints the problems, each model with its precision, disputes and learnings", () => {
		const text = formatAdmin(command, quality);
		expect(text).toContain("quality: attention");
		expect(text).toContain("  1 dispute was pending over 1 hour");
		expect(text).toContain("As of 2026-10-18 00:55 UTC, last 30 days, 4 repos");
		expect(text).toContain(
			"openai/gpt-x  reported 30, fixed 12, dismissed 4, up 9, down 5, precision 72% (52-86%) of 25",
		);
		expect(text).toContain(
			"acme/small  reported 30, fixed 12, dismissed 4, up 9, down 5, precision n/a (3/20 verdicts)",
		);
		expect(text).toContain(
			"Disputes: 6 from 2 agent(s): withdrawn 2, upheld 1, revised 1, closed 0, pending 2 (1 waiting on the account, 1 over 1h)",
		);
		expect(text).toContain(
			"Learnings: 3 added (1 drafted), 4 up, 1 down, 1 turned off; 2 of 5 active",
		);
	});

	test("says when the rollup has not run, and marks capped counts as floors", () => {
		expect(formatAdmin(command, { ...quality, problems: [], status: "ok", asOf: null })).toBe(
			"quality: ok\nThe quality rollup has not run yet (daily at 00:55 UTC).",
		);
		const capped = formatAdmin(command, { ...quality, truncated: true });
		expect(capped).toContain("(capped: counts are floors)");
		expect(capped).toContain("Findings: 41+");
	});
});
