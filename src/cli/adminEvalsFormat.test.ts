import { describe, expect, test } from "bun:test";
import type { AdminEvals } from "../lib/adminClient";
import { formatAdmin } from "./adminCommand";

const command = { kind: "admin.report", report: "evals" } as const;
const T = Date.parse("2026-10-15T06:43:00Z");
const envelope = { command: "bun run eval:spend", note: "Prints the month." };

const off: AdminEvals = {
	status: "ok",
	problems: [],
	configured: false,
	repo: "Code-Panel-AI/codepanel",
	actionsUrl: "https://github.com/Code-Panel-AI/codepanel/actions",
	tokenEnv: "ADMIN_GITHUB_ACTIONS_TOKEN",
	workflows: [],
	envelope,
};

const on: AdminEvals = {
	...off,
	status: "attention",
	problems: ["Weekly drift failed on 2026-10-15 (failure)"],
	configured: true,
	workflows: [
		{
			file: "drift.yml",
			label: "Weekly drift",
			cadence: "Thursdays 06:43 UTC",
			url: "https://github.com/Code-Panel-AI/codepanel/actions/workflows/drift.yml",
			read: true,
			httpStatus: null,
			runs: [
				{
					id: 1,
					status: "completed",
					conclusion: "failure",
					createdAt: T,
					event: "schedule",
					url: "https://github.com/Code-Panel-AI/codepanel/actions/runs/1",
				},
			],
		},
		{
			file: "benchmark.yml",
			label: "Model benchmark",
			cadence: "Mondays 06:17 UTC",
			url: "x",
			read: false,
			httpStatus: 403,
			runs: [],
		},
		{
			file: "eval.yml",
			label: "Review eval",
			cadence: "By hand",
			url: "x",
			read: true,
			httpStatus: null,
			runs: [],
		},
	],
};

describe("formatAdmin evals", () => {
	test("says which secret to set, and links the Actions tab, when it is off", () => {
		const text = formatAdmin(command, off);
		expect(text).toContain("set ADMIN_GITHUB_ACTIONS_TOKEN");
		expect(text).toContain("https://github.com/Code-Panel-AI/codepanel/actions");
		expect(text).toContain("bun run eval:spend");
	});

	test("prints each workflow's last run, unreadable ones and the problems", () => {
		const text = formatAdmin(command, on);
		expect(text).toContain("evals: attention");
		expect(text).toContain(
			"Weekly drift (drift.yml, Thursdays 06:43 UTC): failure, 2026-10-15 06:43 UTC, schedule",
		);
		expect(text).toContain("actions/runs/1");
		expect(text).toContain(
			"Model benchmark (benchmark.yml, Mondays 06:17 UTC): unreadable (HTTP 403)",
		);
		expect(text).toContain("Review eval (eval.yml, By hand): no runs");
	});
});
