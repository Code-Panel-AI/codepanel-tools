/**
 * The author agent's handoff: what it tells the reviewers of its own pull
 * request before they read it (convex/lib/handoff.ts).
 */
import { z } from "zod";
import { pr, repo, tool } from "./define";

export const HANDOFF_TOOL = "submit_handoff";

/** The longest handoff kept whole. Mirrors MAX_HANDOFF_CHARS in convex/lib/handoff.ts. */
const MAX_HANDOFF_CHARS = 6_000;

export const HANDOFF_TOOLS = [
	tool({
		name: HANDOFF_TOOL,
		title: "Submit handoff",
		description:
			"Before review, tell CodePanel's reviewers about the pull request you wrote: what you changed and why, what you tested and how, what you are unsure of, and what you left out on purpose. The next review round reads it (a codepanel-handoff block in the PR description takes precedence). Reviewers check it against the code: a test you name gets its coverage checked, and something you left out on purpose is not reported unless leaving it out breaks the code. Submitting again replaces it.",
		input: {
			repo,
			pr,
			text: z
				.string()
				.min(1)
				.max(MAX_HANDOFF_CHARS)
				.describe("The handoff, in plain text or Markdown: changed, tested, unsure, left out"),
			sha: z
				.string()
				.regex(/^[0-9a-f]{7,40}$/i)
				.optional()
				.describe("The head commit it describes; defaults to the PR's head as CodePanel saw it"),
			agent: z
				.string()
				.optional()
				.describe("Your name, e.g. claude-code. Defaults to this MCP client's name"),
		},
		writes: true,
		run: (c, a) => c.submitHandoff(a),
	}),
];
