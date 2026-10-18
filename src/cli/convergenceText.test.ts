import { expect, test } from "bun:test";
import type { Quality } from "../lib/client";
import { formatConvergence } from "./convergenceText";

type Convergence = Quality["convergence"];

const SEGMENT: Convergence["overall"] = {
	key: "all",
	pullRequests: 30,
	insufficientData: false,
	rounds: { mean: 2.4, p90: 5, fiveOrMore: 0.1, empty: 3 },
	firstGreen: { afterRound1: 0.8, meanRounds: 1.3, never: 1 },
	afterGreen: {
		rounds: 20,
		shareOfRounds: 0.45,
		reBlocked: 8,
		reBlockedShare: 0.4,
		byTrigger: [
			{ trigger: "push", rounds: 12, reBlocked: 6 },
			{ trigger: "base_merge", rounds: 8, reBlocked: 2 },
		],
	},
	findingsByRound: [
		{ round: "1", findings: 50, critical: 1, warning: 20, suggestion: 29 },
		{ round: "2", findings: 20, critical: 0, warning: 5, suggestion: 15 },
		{ round: "3", findings: 5, critical: 0, warning: 1, suggestion: 4 },
		{ round: "4+", findings: 2, critical: 0, warning: 0, suggestion: 2 },
	],
};

function convergence(over: Partial<Convergence> = {}): Convergence {
	return {
		repo: "a/b",
		days: 30,
		since: 0,
		pullRequests: 30,
		truncated: false,
		minPullRequests: 20,
		overall: SEGMENT,
		byPipeline: [SEGMENT],
		...over,
	};
}

test("prints the overall numbers an agent compares first", () => {
	const text = formatConvergence(convergence()).join("\n");
	expect(text).toContain("rounds mean 2.4, p90 5, 5 or more 10%");
	expect(text).toContain("Gate green after round 1: 80%");
	expect(text).toContain(
		"re-blocked 40%. By what started them: push 12 (6 re-blocked), base_merge 8 (2 re-blocked)",
	);
	expect(text).toContain("round 1: 50, round 2: 20, round 3: 5, round 4+: 2");
	expect(text).not.toContain("By pipeline");
});

test("says so when the cohort is thin or cut, and lists pipelines when there are several", () => {
	const thin = { ...SEGMENT, pullRequests: 3, insufficientData: true };
	const text = formatConvergence(
		convergence({
			truncated: true,
			overall: thin,
			byPipeline: [SEGMENT, { ...SEGMENT, key: "x" }],
		}),
	).join("\n");
	expect(text).toContain("newest pull requests only");
	expect(text).toContain("Fewer than 20 pull requests");
	expect(text).toContain("By pipeline:");
});

test("a segment with nothing to divide prints n/a, not zero", () => {
	const empty: Convergence["overall"] = {
		...SEGMENT,
		pullRequests: 0,
		rounds: { mean: null, p90: null, fiveOrMore: null, empty: 0 },
		afterGreen: { ...SEGMENT.afterGreen, reBlockedShare: null, byTrigger: [] },
	};
	const text = formatConvergence(convergence({ overall: empty })).join("\n");
	expect(text).toContain("rounds mean n/a");
	expect(text).toContain("re-blocked n/a.");
});
