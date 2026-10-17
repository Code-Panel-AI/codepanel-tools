import { expect, test } from "bun:test";
import { parseArgs } from "./args";
import { formatSettings } from "./settingsCommand";

const cmd = (line: string) => parseArgs(line.split(" ").filter(Boolean)).command;

test("budget reads the account, or a repository too", () => {
	expect(cmd("budget")).toEqual({ kind: "budget" });
	expect(cmd("budget acme/app")).toEqual({ kind: "budget", repo: "acme/app" });
});

test("budget set takes an amount, default or none, and a cap with its repository", () => {
	expect(cmd("budget set --monthly 50")).toMatchObject({ kind: "budget.set", monthlyUsd: 50 });
	expect(cmd("budget set --monthly default")).toMatchObject({ monthlyUsd: "default" });
	expect(cmd("budget set --monthly none")).toMatchObject({ monthlyUsd: null });
	expect(cmd("budget set --repo acme/app --cap 12.5")).toMatchObject({
		repo: "acme/app",
		capUsd: 12.5,
	});
	expect(cmd("budget set --repo acme/app --cap none")).toMatchObject({ capUsd: null });
	expect(() => cmd("budget set --cap 10")).toThrow("--cap needs --repo");
	expect(() => cmd("budget set --monthly 0")).toThrow("--monthly");
	expect(() => cmd("budget set --repo acme/app --cap default")).toThrow("--cap");
	expect(() => cmd("budget set")).toThrow("budget set needs");
});

test("repos set --switches takes only allow-listed names", () => {
	expect(
		cmd("repos set acme/app --switches REVIEW_CACHEABLE_PROMPTS=on,REVIEW_REVIEWER_TOOLS=default"),
	).toMatchObject({
		kind: "repos.set",
		reviewSwitches: { REVIEW_CACHEABLE_PROMPTS: true, REVIEW_REVIEWER_TOOLS: null },
	});
	expect(cmd("repos set acme/app --switches REVIEW_CHANGED_LINES=off")).toMatchObject({
		reviewSwitches: { REVIEW_CHANGED_LINES: false },
	});
	expect(() => cmd("repos set acme/app --switches ORCHESTRATOR_TOOLS=on")).toThrow("--switches");
	expect(() => cmd("repos set acme/app --switches REVIEW_CHANGED_LINES=yes")).toThrow("--switches");
	expect(() => cmd("repos set acme/app --switches REVIEW_CHANGED_LINES=constructor")).toThrow(
		"--switches",
	);
	expect(cmd("repos switches acme/app")).toEqual({ kind: "repos.switches", repo: "acme/app" });
});

test("a reached limit says it is not enforced before the limits' migration has run", () => {
	const account = {
		limitUsd: 25,
		source: "default" as const,
		spentUsd: 30,
		heldUsd: 0,
		remainingUsd: 0,
		status: "reached" as const,
	};
	const text = (enforced: boolean) =>
		formatSettings({ kind: "budget" }, { month: "2026-10", enforced, account });
	expect(text(false)).toContain("[reached, not enforced]");
	expect(text(true)).toContain("[reached]");
});

test("an unlimited budget or cap reads as unlimited, never as none left", () => {
	const unlimited = {
		spentUsd: 0,
		heldUsd: 0,
		remainingUsd: null,
		status: "unlimited" as const,
	};
	const state = {
		month: "2026-10",
		enforced: true,
		account: { ...unlimited, limitUsd: null, source: "none" as const },
		repo: {
			...unlimited,
			repo: "alice/app",
			capUsd: null,
			review: { status: "unlimited", remainingUsd: null, limitedBy: null, refusal: null },
		},
	};
	const text = formatSettings({ kind: "budget", repo: "alice/app" }, state);
	expect(text).toContain(
		"Account budget: unlimited (no limit set); spent $0.00, held $0.00, left unlimited",
	);
	expect(text).toContain(
		"alice/app cap: no cap (account budget only); spent $0.00, held $0.00, left unlimited",
	);
	expect(text).toContain("Next round: unlimited, no limit applies");
	expect(text).not.toContain("none");
	expect(text).not.toContain("left $0");
});

test("a limit with money left still prints the amount", () => {
	const state = {
		month: "2026-10",
		enforced: true,
		account: {
			limitUsd: 25,
			source: "default" as const,
			spentUsd: 4,
			heldUsd: 1,
			remainingUsd: 20,
			status: "open" as const,
		},
	};
	expect(formatSettings({ kind: "budget" }, state)).toContain(
		"Account budget: $25.00 (default); spent $4.00, held $1.00, left $20.00",
	);
});
