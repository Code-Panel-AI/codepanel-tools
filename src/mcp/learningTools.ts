/**
 * Tools for a repository's learnings: short facts the orchestrator checks
 * against the code when a pull request touches their scope. An agent's own
 * learning waits for a person or another identity on another pull request
 * before it applies, so an author agent never loosens its own review.
 */
import { z } from "zod";
import { FEEDBACK_REASONS } from "../lib/client";
import { pr, repo, tool } from "./define";

export const ADD_LEARNING_TOOL = "add_learning";
export const RATE_LEARNING_TOOL = "rate_learning";

const agent = z
	.string()
	.optional()
	.describe("Your name, e.g. claude-code. Defaults to this MCP client's name");

export const LEARNING_TOOLS = [
	tool({
		name: "list_learnings",
		title: "List learnings",
		description:
			"A repository's learnings, highest ref first: ref (L3), text, scope (a path prefix; empty for the whole repository) and state. state.status is active (applied to pull requests opened after it activated), candidate (state.needs says what would confirm it), off (someone rated it down) or expired (no up for 180 days; an up re-confirms it). A learning with source drafted was written by the orchestrator from at least three false positives on two or more pull requests; drafted.evidence lists them (label, file, note). It is active at once; rate it down if the code contradicts it.",
		input: { repo },
		writes: false,
		run: (c, a) => c.listLearnings(a.repo),
	}),
	tool({
		name: ADD_LEARNING_TOOL,
		title: "Add learning",
		description:
			'Record a learning: one short fact about this repository that would stop reviewers from repeating a wrong finding, e.g. "In convex/reviews/, renew() extends the lease before any write". At most 500 characters, one paragraph; give scope as a path prefix when it holds only there. Added by an agent, it is a candidate until a person confirms it or another identity confirms it on another pull request, and it never applies to the pull request it came from. Same as commenting /remember on the pull request. Returns its ref.',
		input: {
			repo,
			text: z.string().min(1).max(500).describe("The fact, specific enough to check against code"),
			scope: z.string().optional().describe("Path prefix it holds under, e.g. convex/reviews/"),
			pr: pr
				.optional()
				.describe(
					"The pull request this came from. An agent's learning without one can never count toward activation",
				),
			agent,
		},
		writes: true,
		run: (c, a) => c.addLearning(a),
	}),
	tool({
		name: RATE_LEARNING_TOOL,
		title: "Rate learning",
		description:
			"Confirm (up) or turn off (down) a learning by its ref, e.g. L3, as named in a review's Learnings line or list_learnings. Any down turns it off at once; give a reason and a one-sentence note saying what in the code contradicts it. Rating again replaces your earlier rating. Same as commenting /feedback L3 up|down on a pull request.",
		input: {
			repo,
			ref: z
				.string()
				.regex(/^[Ll]\d+$/)
				.describe('The learning, e.g. "L3"'),
			rating: z.enum(["up", "down"]),
			reason: z
				.string()
				.optional()
				.describe(`One of ${FEEDBACK_REASONS.join(", ")}; hyphens are fine`),
			note: z.string().max(1000).optional().describe("Why, in a sentence: what you checked"),
			pr: pr
				.optional()
				.describe(
					"The pull request you are working on. An agent's up without one never counts toward activation",
				),
			agent,
		},
		writes: true,
		run: (c, a) => c.rateLearning(a),
	}),
];
