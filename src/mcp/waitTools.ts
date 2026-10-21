/**
 * Tools that wait for a review, so an agent makes one call instead of
 * polling list_sessions and get_review.
 */
import { z } from "zod";
import { askAndWait, DEFAULT_ASK_TIMEOUT_MS } from "../lib/ask";
import { DEFAULT_WAIT_TIMEOUT_MS, type WaitOptions, waitForReview } from "../lib/wait";
import { pr, repo, type ToolContext, tool } from "./define";

const MS = 1000;
const MAX_TIMEOUT_SECONDS = 600;

export const timeoutSeconds = z
	.number()
	.int()
	.positive()
	.max(MAX_TIMEOUT_SECONDS)
	.optional()
	.describe(
		`Give up after this many seconds (default ${DEFAULT_WAIT_TIMEOUT_MS / MS}, max ${MAX_TIMEOUT_SECONDS}). On timeout the result says whether a review is running, and you call again. The remote server (/mcp) ends each call within about 80 seconds whatever you pass; use a smaller value if your client cancels tool calls sooner.`,
	);

/** The timeout a call asked for, or the default, held to what its host allows. */
function boundedTimeout(
	context: ToolContext | undefined,
	seconds: number | undefined,
	fallbackMs: number,
): number {
	const asked = seconds === undefined ? fallbackMs : seconds * MS;
	return context?.maxWaitMs === undefined ? asked : Math.min(asked, context.maxWaitMs);
}

/** Wait options for a tool call: its cancellation, a progress ping per poll, and the timeout. */
export function waitOptions(context: ToolContext | undefined, seconds?: number): WaitOptions {
	return {
		signal: context?.signal,
		sleep: context?.sleep,
		now: context?.now,
		timeoutMs: boundedTimeout(context, seconds, DEFAULT_WAIT_TIMEOUT_MS),
		onPoll: (status) => context?.progress?.(status.activity ?? status.status ?? "waiting"),
	};
}

export const ASK_TOOL = "ask_reviewer";

export const WAIT_TOOLS = [
	tool({
		name: ASK_TOOL,
		title: "Ask reviewer",
		description:
			"Ask the review's orchestrator a question about the pull request's review or one of its findings (pass ref, e.g. F3), and wait for the answer. Use it before disputing a finding you do not understand. Never starts a review; counts toward the account's monthly budget (and the repository's cap) and is limited per pull request. If the answer concedes the finding is wrong, the finding is withdrawn (concedes: true). Status pending means it ran out of time: call again with questionId set to its id to keep waiting, which asks nothing new.",
		input: {
			repo,
			pr,
			question: z
				.string()
				.min(1)
				.max(2000)
				.optional()
				.describe("The question, in a sentence or two. Required unless questionId is set"),
			questionId: z
				.string()
				.optional()
				.describe("The id of a question that came back pending: wait for its answer instead"),
			ref: z.string().optional().describe("The finding asked about, e.g. F3"),
			agent: z
				.string()
				.optional()
				.describe("Your name, e.g. claude-code. Defaults to this MCP client's name"),
			timeoutSeconds: z
				.number()
				.int()
				.positive()
				.max(MAX_TIMEOUT_SECONDS)
				.optional()
				.describe(
					`Give up waiting after this many seconds (default ${DEFAULT_ASK_TIMEOUT_MS / MS}).`,
				),
		},
		writes: true,
		run: (c, a, context) => {
			const { timeoutSeconds: seconds, questionId, question, ...args } = a;
			const options = {
				signal: context?.signal,
				timeoutMs: boundedTimeout(context, seconds, DEFAULT_ASK_TIMEOUT_MS),
			};
			if (questionId) return askAndWait(c, { questionId }, options);
			if (!question) throw new Error("Pass a question, or the questionId of a pending one");
			return askAndWait(c, { ...args, question }, options);
		},
	}),
	tool({
		name: "wait_for_review",
		title: "Wait for review",
		description:
			"Block until the pull request's latest review finishes, then return it (status finished, with outcome completed or failed, and the same review get_review returns). Use after trigger_review (or trigger_review with wait), or after pushing a commit (pass headSha), instead of polling. Status timeout with running: true means the review is still running: call again. Status timeout with running: false means no review has started yet (a push can take a few seconds to reach CodePanel): call again, and calls made one after another count together until no_review. status no_review means none started in time: call trigger_review, or check that the repository is connected and auto-review is on.",
		input: {
			repo,
			pr,
			timeoutSeconds,
			headSha: z
				.string()
				.regex(/^[0-9a-f]{7,40}$/i)
				.optional()
				.describe(
					"After pushing, the commit to wait for (git rev-parse HEAD). Without it, the latest finished review counts, which can still be the previous commit's.",
				),
		},
		writes: false,
		run: (c, a, context) =>
			waitForReview(
				c,
				{ repo: a.repo, pr: a.pr },
				{ ...waitOptions(context, a.timeoutSeconds), headSha: a.headSha },
			),
	}),
];
