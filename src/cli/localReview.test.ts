import { describe, expect, test } from "bun:test";
import {
	briefPathsParam,
	type CodePanelClient,
	MAX_BRIEF_PATHS,
	type ReviewBrief,
} from "../lib/client";
import { parseArgs, UsageError } from "./args";
import {
	executeLocalReview,
	formatLocalReview,
	type GitRunner,
	repoFromRemote,
} from "./localReview";

const brief = (repo: string): ReviewBrief => ({
	repo,
	gateLevel: "warning",
	paths: { used: [], dropped: 0, refused: 0, max: 200 },
	seats: [],
	learnings: [],
	droppedLearnings: [],
	chars: 7,
	text: "# Brief\n",
});

function fakeClient(
	calls: Array<{ repo: string; paths?: ReadonlyArray<string> }>,
): CodePanelClient {
	return {
		getReviewBrief: async (repo: string, paths?: ReadonlyArray<string>) => {
			calls.push({ repo, paths });
			return brief(repo);
		},
	} as unknown as CodePanelClient;
}

/** A checkout on a branch off origin/main that changed two files and has one new file. */
const checkout: GitRunner = async (args) => {
	const key = args.join(" ");
	if (key === "remote get-url origin") return "git@github.com:alice/app.git\n";
	if (key === "rev-parse --abbrev-ref origin/HEAD") return "origin/main\n";
	if (key === "merge-base HEAD origin/main") return "abc123\n";
	if (key === "diff -z --name-only abc123") return "src/a.ts\0src/caf\u00e9 b.ts\0";
	if (key === "ls-files -z --full-name --others --exclude-standard :/")
		return "src/new.ts\0src/a.ts\0 padded.ts\0";
	if (key === "show origin/main:.codepanel/rules.md") return "Every query uses an index.\n";
	return null;
};

describe("review --local arguments", () => {
	test("takes an optional repository and --paths", () => {
		expect(parseArgs(["review", "--local"]).command).toEqual({
			kind: "review.local",
			repo: undefined,
			paths: undefined,
		});
		expect(
			parseArgs(["review", "alice/app#4", "--local", "--paths", "a.ts, b.ts"]).command,
		).toEqual({ kind: "review.local", repo: "alice/app", paths: ["a.ts", "b.ts"] });
	});

	test("refuses flags of a panel review", () => {
		expect(() => parseArgs(["review", "--local", "--trigger"])).toThrow(UsageError);
		expect(() => parseArgs(["review", "--local", "--wait"])).toThrow(UsageError);
		expect(() => parseArgs(["review", "--local", "--sha", "abc1234"])).toThrow(UsageError);
	});
});

describe("briefPathsParam", () => {
	test("skips paths with a comma and those past the cap, and counts them", () => {
		expect(briefPathsParam(["a.ts", "b,c.ts", "d.ts"])).toEqual({ param: "a.ts,d.ts", skipped: 1 });
		const many = Array.from({ length: MAX_BRIEF_PATHS + 3 }, (_, i) => `f${i}`);
		expect(briefPathsParam(many).skipped).toBe(3);
		expect(briefPathsParam([]).param).toBeUndefined();
	});

	test("keeps the query under its length limit", () => {
		const long = Array.from({ length: 50 }, (_, i) => `${i}`.padEnd(1_000, "x"));
		const { param, skipped } = briefPathsParam(long);
		expect((param ?? "").length).toBeLessThanOrEqual(16_000);
		expect(skipped).toBeGreaterThan(0);
	});
});

describe("repoFromRemote", () => {
	test("reads https and ssh GitHub remotes, and nothing else", () => {
		expect(repoFromRemote("https://github.com/alice/app.git")).toBe("alice/app");
		expect(repoFromRemote("git@github.com:alice/my.app")).toBe("alice/my.app");
		expect(repoFromRemote("https://gitlab.com/alice/app.git")).toBeNull();
		expect(repoFromRemote(null)).toBeNull();
	});
});

describe("executeLocalReview", () => {
	test("in a checkout, sends the branch's changed paths and adds the base's rules file", async () => {
		const calls: Array<{ repo: string; paths?: ReadonlyArray<string> }> = [];
		const result = await executeLocalReview({ kind: "review.local" }, fakeClient(calls), checkout);
		expect(calls).toEqual([
			{ repo: "alice/app", paths: ["src/a.ts", "src/caf\u00e9 b.ts", "src/new.ts", " padded.ts"] },
		]);
		const text = formatLocalReview(result);
		expect(text).toContain("# Brief");
		expect(text).toContain("```\nEvery query uses an index.\n```");
		expect(text).toContain("## Changed paths since origin/main (4)\n- src/a.ts");
	});

	test("--paths wins over the checkout", async () => {
		const calls: Array<{ repo: string; paths?: ReadonlyArray<string> }> = [];
		await executeLocalReview(
			{ kind: "review.local", repo: "bob/x", paths: ["lib/y.ts"] },
			fakeClient(calls),
			checkout,
		);
		expect(calls).toEqual([{ repo: "bob/x", paths: ["lib/y.ts"] }]);
	});

	test("outside a checkout, needs the repository and sends no paths", async () => {
		const calls: Array<{ repo: string; paths?: ReadonlyArray<string> }> = [];
		const none: GitRunner = async () => null;
		await expect(
			executeLocalReview({ kind: "review.local" }, fakeClient(calls), none),
		).rejects.toThrow(UsageError);
		const result = await executeLocalReview(
			{ kind: "review.local", repo: "alice/app" },
			fakeClient(calls),
			none,
		);
		expect(calls).toEqual([{ repo: "alice/app", paths: [] }]);
		const text = formatLocalReview(result);
		expect(text).toStartWith("# Brief");
		expect(text).toContain("Could not diff against origin/main");
		expect(text).toContain("No .codepanel/rules.md read from origin/main.");
	});
});
