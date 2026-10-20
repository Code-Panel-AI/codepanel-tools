import { describe, expect, test } from "bun:test";
import type { AdminRepos } from "../lib/adminClient";
import { formatAdmin } from "./adminCommand";

const T = Date.parse("2026-10-18T12:00:00Z");

const repos: AdminRepos = {
	status: "attention",
	problems: [
		"1 repo lacks the Commit statuses permission, so the merge gate is not on its pull requests",
	],
	counts: {
		total: 5,
		truncated: false,
		byHealth: [
			{ health: "live", count: 3 },
			{ health: "no_events", count: 1 },
			{ health: "no_status", count: 1 },
		],
	},
	statusRefused: {
		count: 1,
		missingPermission: 1,
		truncated: false,
		rows: [
			{
				repoId: "r1",
				repo: "acme/api",
				owner: "acme",
				login: "octocat",
				state: "missing_permission",
				httpStatus: 403,
				since: T,
			},
		],
	},
	installations: {
		count: 1,
		truncated: false,
		rows: [{ installationId: 77, owner: "acme", repoCount: 2, repos: [] }],
	},
};

const run = (r: AdminRepos) => formatAdmin({ kind: "admin.report", report: "repos" }, r);

describe("admin repos", () => {
	test("prints health counts, refused repositories and installations", () => {
		const text = run(repos);
		expect(text).toContain("repos: attention");
		expect(text).toContain(
			"  1 repo lacks the Commit statuses permission, so the merge gate is not on its pull requests",
		);
		expect(text).toContain("Repositories: 5 (live 3, no_events 1, no_status 1)");
		expect(text).toContain("acme/api  octocat  missing_permission HTTP 403 since 2026-10-18 12:00");
		expect(text).toContain("77  acme  2 repo(s)");
		expect(text).toContain("Add --json for the full report.");
	});

	test("a cut read shows its counts as floors, and a clean one lists nothing", () => {
		const text = run({
			...repos,
			status: "ok",
			problems: [],
			counts: { ...repos.counts, truncated: true },
			statusRefused: {
				count: 0,
				missingPermission: 0,
				truncated: false,
				rows: [],
			},
			installations: { count: 0, truncated: true, rows: [] },
		});
		expect(text).toContain("Repositories: 5+");
		expect(text).toContain("Commit status refused: 0");
		expect(text).toContain("GitHub App installations: 0+");
		expect(text).not.toContain("Refused:");
	});
});
