/**
 * The tools that say a finding was right or wrong. Both come from an agent
 * (tools.ts withAgentName fills in its name), so a verdict that a finding is
 * wrong disputes it: the orchestrator checks it against the code first.
 */
import { z } from "zod";
import { CodePanelError, DISMISS_REASONS, FEEDBACK_REASONS } from "../lib/client";
import { pr, repo, tool } from "./define";
import { ASK_TOOL } from "./waitTools";

const RATE_TOOL = "rate_finding";
/** As many as one /feedback comment takes (MAX_FEEDBACK_LINES in convex/lib/feedbackComment.ts). */
const MAX_BATCH_RATINGS = 50;
const DISMISS_TOOL = "dismiss_finding";
const REOPEN_TOOL = "reopen_finding";

/** Tools whose calls carry the agent's name. */
export const AGENT_TOOLS: ReadonlySet<string> = new Set([RATE_TOOL, DISMISS_TOOL, ASK_TOOL]);

const agent = z
	.string()
	.optional()
	.describe(
		"Your harness, e.g. claude-code (a Claude model id is read as claude-code and kept as the model). Defaults to this MCP client's name",
	);
const note = z.string().max(1000).optional().describe("Why, in a sentence: what you checked");

/** Lenient, as the API is: "false-positive", "fp" and "not-a-bug" all read as false_positive. */
const dismissReason = z
	.string()
	.optional()
	.describe(
		`Why: one of ${DISMISS_REASONS.join(", ")}. false_positive: the problem isn't real; deferred: real, handled outside this pull request. Hyphens and spaces are fine`,
	);
const rateReason = z
	.string()
	.optional()
	.describe(
		`One of ${FEEDBACK_REASONS.join(", ")}. fixed or useful for up; false_positive, wrong_location, not_worth_fixing, duplicate, unclear or other for down; deferred (real, handled outside this pull request) for either. Hyphens are fine`,
	);
const ref = z
	.string()
	.describe('The finding as the review names it, e.g. "F3", or "review" for the whole review');
const rating = z.enum(["up", "down"]);

const ratingDetails = {
	reason: rateReason,
	note,
	verdict: rateReason.describe("Alias for reason; if both are given they must agree"),
	comment: note.describe("Alias for note; if both are given they must agree"),
};
const batchItem = z.object({ ref, rating, ...ratingDetails });

export const FINDING_TOOLS = [
	tool({
		name: DISMISS_TOOL,
		title: "Dismiss finding",
		description:
			"Say a finding is wrong or not worth fixing. Name it by repo, pr and ref (F3), or by findingId. From an agent this disputes the finding, as a down rating does: it stays open until the orchestrator checks your note against the code and withdraws it (see dispute in get_review). Give the reason and a note. deferred (real, handled outside this pull request) is not disputed: it closes the finding. Don't use this for findings you fixed; the next review closes those itself.",
		input: {
			repo: repo.optional(),
			pr: pr.optional(),
			ref: z.string().optional().describe('The finding as the review names it, e.g. "F3"'),
			findingId: z
				.string()
				.optional()
				.describe("Finding id, from get_review or list_findings, instead of repo, pr and ref"),
			reason: dismissReason,
			note,
			agent,
		},
		writes: true,
		run: (c, a) => c.dismissFinding(a),
	}),
	tool({
		name: REOPEN_TOOL,
		title: "Reopen finding",
		description:
			'Reopen a dismissed finding. A finding dismissed earlier that a later round reports again stays closed, and get_review lists it under suppressed with who dismissed it, why and when; reopen it here when it is real after all. Name it by findingId, or by repo, pr and ref ("F3"). Reopening one that is not dismissed changes nothing (reopened: false).',
		input: {
			findingId: z.string().optional().describe("Finding id, from get_review or list_findings"),
			repo: repo.optional(),
			pr: pr.optional(),
			ref: z.string().optional().describe('The finding as the review names it, e.g. "F3"'),
		},
		writes: true,
		run: (c, a) => c.reopenFinding(a),
	}),
	tool({
		name: RATE_TOOL,
		title: "Rate finding",
		description:
			"Say whether a review finding was right, so the reviewers improve. Rate every finding you acted on or checked: up when it was a real problem (reason fixed if you fixed it), down when it was wrong (reason false_positive, wrong_location, ...), with a one-sentence note saying why. Rate many at once with ratings (up to 50, like the lines of a /feedback comment); each item succeeds or fails on its own, and the result lists them with ok and, on failure, error and code. Use ref review to rate the whole review. A down rating with false_positive, wrong_location, not_worth_fixing or duplicate disputes the finding: the orchestrator checks your note against the code, usually within a few minutes or with the next round, and withdraws, upholds or revises it (see dispute in get_review); it stays open until withdrawn. Rating again replaces your earlier rating. The pull request stays blocked (get_review's gate) until every gated finding is fixed or answered: a verdict (fixed, deferred, or a down reason above) answers it, and a disputed one once the orchestrator withdraws or revises it (an upheld one needs fixed or deferred).",
		input: {
			repo,
			pr,
			ref: ref.optional().describe(`${ref.description}. Required unless ratings is given`),
			rating: rating.optional().describe("Required unless ratings is given"),
			...ratingDetails,
			ratings: z
				.array(batchItem)
				.min(1)
				.max(MAX_BATCH_RATINGS)
				.optional()
				.describe("Several ratings in one call, instead of ref and rating"),
			agent,
		},
		writes: true,
		run: (c, { ratings, ref: one, rating: verdict, ...a }) => {
			if (ratings) {
				if (
					[one, verdict, a.reason, a.note, a.verdict, a.comment].some(
						(value) => value !== undefined,
					)
				) {
					throw new CodePanelError(
						400,
						"with ratings, put targets and rating details inside each item",
						{ code: "invalid_input" },
					);
				}
				return c.rateMany({ repo: a.repo, pr: a.pr, agent: a.agent, ratings });
			}
			if (!one || !verdict) {
				throw new CodePanelError(400, "give ref and rating, or ratings", { code: "invalid_input" });
			}
			return c.rate({ ...a, ref: one, rating: verdict });
		},
	}),
];
