/**
 * Review quality as numbers an author agent cannot inflate: verified true
 * and false positives per model, role, severity and confidence, kept apart
 * from what an agent produces by complying (addressedByCommit, its own
 * ratings); and how the review loop converges (rounds, gate state, rounds
 * after green).
 */
import { z } from "zod";
import { repo, tool } from "./define";

export const GET_QUALITY_TOOL = "get_quality";

export const QUALITY_TOOLS = [
	tool({
		name: GET_QUALITY_TOOL,
		title: "Get review quality",
		description:
			"A repository's verified review precision over the last `days` (default 30, at most 90), as overall and per byModel, byRole, bySeverity, byConfidence and bySeverityConfidence rows keyed by `key`. Each row's `verified` counts only verdicts the author agent cannot give itself: truePositives (disputes the orchestrator upheld or revised, ups from trusted people) and falsePositives (disputes it withdrew, trusted people's false-positive or not-worth-fixing downs and dismissals). precision = TP/(TP+FP) with a 95% interval, null with insufficientData true below minSample verdicts. `unverified` is NOT precision: addressedByCommit counts findings resolved by a commit that edited their lines, which complying with every finding produces, plus agents' own ratings and dismissals of unknown origin. Role is matched from reviewer names, so it is approximate. `convergence` is how the review loop converges over the same window, for pull requests merged in it: overall and byPipeline (the pipeline that ran a pull request's first round) with rounds {mean, p90, fiveOrMore}, firstGreen {afterRound1, meanRounds, never} (the gate rebuilt after each round at warning or worse), afterGreen {rounds, reBlocked, reBlockedShare, byTrigger: manual, push, base_merge, or unknown for rounds that predate the record} and findingsByRound (severity mix by the round a finding was first seen). Rates are null when there is nothing to divide; insufficientData is true below minPullRequests; the gate rebuild is a lower bound on how often it was red. `convergence.loop` is the author agent's side for the same pull requests, overall and byGuidance (the guidanceHash of the agent-facing text its first round ran with): pushesPerRound, toolCallsPerRound (reads of the review plus API ratings and disputes; polling not counted), bytesServedPerRound (bytes of the reviews read), afterServed (for each nextAction served, whether a push, rating, dispute, trigger or nothing came next) and clients (who read, with the tools version when sent).",
		input: {
			repo,
			days: z.number().int().min(1).max(90).optional().describe("Window in days, default 30"),
		},
		writes: false,
		run: (c, a) => c.getQuality(a.repo, a.days),
	}),
];
