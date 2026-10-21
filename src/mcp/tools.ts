/**
 * CodePanel's MCP tools, as data: a name, what the assistant is told, the
 * input shape, whether it changes anything, and the client call it makes.
 * server.ts registers these; tests exercise them without stdio.
 */
import { z } from "zod";
import { GATE_LEVELS } from "../lib/client";
import { triggerAndWait } from "../lib/wait";
import { BRIEF_TOOLS, LOCAL_REVIEW_TOOL } from "./briefTools";
import { BUDGET_TOOLS } from "./budgetTools";
import { escalation, panelId, pr, repo, roundSettings, rounds, type ToolDef, tool } from "./define";
import { AGENT_TOOLS, FINDING_TOOLS } from "./findingTools";
import { HANDOFF_TOOL, HANDOFF_TOOLS } from "./handoffTool";
import { KNOWLEDGE_TOOLS } from "./knowledgeTools";
import { ADD_LEARNING_TOOL, LEARNING_TOOLS, RATE_LEARNING_TOOL } from "./learningTools";
import { PANEL_PLAN_TOOLS } from "./panelPlanTools";
import { QUALITY_TOOLS } from "./qualityTools";
import { reviewSwitches, SWITCH_TOOLS } from "./switchTools";
import { timeoutSeconds, WAIT_TOOLS, waitOptions } from "./waitTools";

export type { ToolDef };

const effort = z
	.enum(["none", "low", "medium", "high", "xhigh", "max"])
	.optional()
	.describe("How hard the model should think");
const pathScope = z
	.object({ include: z.array(z.string()).default([]), exclude: z.array(z.string()).default([]) })
	.nullable()
	.optional()
	.describe(
		"Reviewer trigger paths as globs; null clears. Runs before spending; matched reviewers get full context.",
	);
const agentId = z
	.string()
	.describe("Id of a reviewer or the orchestrator on the panel, from get_panel");
const provider = z.string().describe("Provider id, from list_models");
const modelId = z.string().describe("Model id exactly as list_models reports it");

export const TOOLS: ToolDef[] = [
	tool({
		name: "get_reviewer_tools",
		title: "Get reviewer tool capabilities",
		description:
			"Which tools reviewers receive, their limits and effective enablement. Pass repo for its effective switch; without repo shows the deployment default. Includes file reads, bounded search, and whether git history is available.",
		input: { repo: repo.optional() },
		writes: false,
		run: (c, a) => c.reviewerTools(a),
	}),
	tool({
		name: "whoami",
		title: "Show current account",
		description:
			"The GitHub account and scopes of the configured CodePanel API token, and its subscription: when subscription.active is false, reviews are refused until the person subscribes at subscription.nextAction. subscription.plan gives the plan, its pull requests this month (prsThisMonth of prsPerMonth) and allowance (within, near, grace, paused); when paused, new pull requests are refused with plan_limit until the 1st.",
		input: {},
		writes: false,
		run: (c) => c.me(),
	}),

	// --- repositories ------------------------------------------------------
	tool({
		name: "list_repos",
		title: "List connected repositories",
		description: "Repositories connected to CodePanel, with their review settings.",
		input: {},
		writes: false,
		run: (c) => c.listRepos(),
	}),
	tool({
		name: "list_connectable_repos",
		title: "List connectable repositories",
		description:
			"GitHub repositories the user can push to. Connecting one needs canInstallWebhook (admin).",
		input: {},
		writes: false,
		run: (c) => c.listConnectableRepos(),
	}),
	tool({
		name: "connect_repo",
		title: "Connect repository",
		description:
			"Connect a GitHub repository and install CodePanel's webhook so new pull requests are reviewed.",
		input: { repo },
		writes: true,
		run: (c, a) => c.connectRepo(a.repo),
	}),
	tool({
		name: "disconnect_repo",
		title: "Disconnect repository",
		description: "Stop reviewing a repository. Past reviews are kept.",
		input: { repo },
		writes: true,
		run: (c, a) => c.disconnectRepo(a.repo),
	}),
	tool({
		name: "update_repo_settings",
		title: "Update repository settings",
		description:
			"Turn automatic review on or off for a repository, cap its automatic review rounds per pull request, set how far bots may extend them, set the round from which reviews advise stepping back (stepBackAfterRounds, 0 off), pin it to a specific panel (null for the default), post inline suggestion comments on the diff (inlineSuggestions), choose which findings must be answered before its CodePanel commit status passes (gate), choose whether reviews read its AGENTS.md and CLAUDE.md, set its own review switches (reviewSwitches), or name people to ask about findings no agent can settle (escalation).",
		input: {
			repo,
			autoReview: z.boolean().optional(),
			...roundSettings,
			inlineSuggestions: z
				.boolean()
				.optional()
				.describe(
					"Also post critical and warning findings that have a checked patch as inline GitHub suggestion comments. Off by default; the summary comment and get_review are unchanged.",
				),
			panelId: z.string().nullable().optional().describe("Panel to use, or null for the default"),
			gate: z
				.enum(GATE_LEVELS)
				.optional()
				.describe(
					"Findings that must be fixed or answered before the commit status passes: critical, warning (critical and warning, the default), all, or off for no status",
				),
			agentFiles: z
				.boolean()
				.optional()
				.describe(
					"Read AGENTS.md and CLAUDE.md from the base branch as review context (off unless turned on)",
				),
			reviewSwitches,
			escalation,
		},
		writes: true,
		run: (c, a) => c.updateRepoSettings(a),
	}),

	// --- review panel ------------------------------------------------------
	tool({
		name: "get_panel",
		title: "Get review panel",
		description:
			"Review panels; optionally filter by repo (its effective panel) or panelId, but not both. Includes reviewers, orchestrator, whether each member's provider key works (callable), whether it keeps failing (failure, with the provider's error; switching its model clears it) and whether the panel can run (ready).",
		input: { repo: repo.optional(), panelId: panelId.optional() },
		writes: false,
		run: (c, a) => c.listPanels(a),
	}),
	tool({
		name: "list_models",
		title: "List models",
		description:
			"Models the user's provider keys can reach, with prices and explicit tier rankings. Null prices mean cost unknown; spending limits refuse unpriced calls. Tier labels are recommendations, not model capabilities. Panel members can only use models listed here.",
		input: {},
		writes: false,
		run: (c) => c.listModels(),
	}),
	tool({
		name: "list_roles",
		title: "List reviewer roles",
		description:
			"Reviewer roles (what a reviewer looks for) with the cost tier each is suggested on. Pass an id as add_reviewer's role.",
		input: {},
		writes: false,
		run: (c) => c.listRoles(),
	}),
	tool({
		name: "add_reviewer",
		title: "Add reviewer",
		description:
			"Add a reviewer to a panel. Prefer a role: it sets the name, instructions and effort, and picks a model on the role's cost tier from a provider the panel doesn't use yet. Pass provider (and modelId) to choose the model yourself; without a role both are required. Explicit name, systemPrompt and reasoningEffort override the role's.",
		input: {
			panelId,
			role: z.string().optional().describe("Role id, from list_roles"),
			provider: provider.optional(),
			modelId: modelId.optional(),
			reasoningEffort: effort,
			name: z.string().optional(),
			pathScope,
			systemPrompt: z
				.string()
				.optional()
				.describe("Instructions; replaces the role's if both are given"),
		},
		writes: true,
		run: (c, a) => c.addReviewer(a),
	}),
	tool({
		name: "remove_reviewer",
		title: "Remove reviewer",
		description: "Remove a reviewer from a panel. A panel keeps at least one reviewer.",
		input: { panelId, agentId },
		writes: true,
		run: (c, a) => c.removeReviewer(a),
	}),
	tool({
		name: "update_panel_member",
		title: "Update reviewer",
		description:
			"Atomically change a panel member while preserving its id and review history. Use name to rename, systemPrompt for reviewer instructions, instructions for additions to the orchestrator prompt; an empty string clears instructions. All fields remain unchanged if any field is refused. Returns the saved member. Pass provider and modelId together.",
		input: {
			agentId,
			name: z.string().optional(),
			instructions: z.string().optional().describe("Orchestrator additions; empty string clears"),
			provider: provider.optional(),
			modelId: modelId.optional(),
			reasoningEffort: effort,
			systemPrompt: z.string().optional(),
			pathScope,
		},
		writes: true,
		run: (c, a) => c.updateMember(a),
	}),
	tool({
		name: "set_orchestrator",
		title: "Set orchestrator",
		description: "Choose the model that consolidates the panel's reviews and posts to GitHub.",
		input: { panelId, provider, modelId, reasoningEffort: effort },
		writes: true,
		run: (c, a) => c.setOrchestrator(a),
	}),
	tool({
		name: "update_panel",
		title: "Update panel",
		description: "Rename a panel or set its per-pull-request spending limit in USD (null clears).",
		input: {
			panelId,
			name: z.string().optional(),
			budgetUsd: z.number().positive().nullable().optional(),
		},
		writes: true,
		run: (c, a) => c.updatePanel(a),
	}),
	...PANEL_PLAN_TOOLS,

	// --- keys --------------------------------------------------------------
	tool({
		name: "get_key_status",
		title: "Get provider key status",
		description:
			"Which AI providers have a working API key. Keys themselves are never shown; add or fix them in CodePanel Settings → Provider keys.",
		input: {},
		writes: false,
		run: (c) => c.keyStatus(),
	}),

	// --- reviews -----------------------------------------------------------
	tool({
		name: "trigger_review",
		title: "Trigger review",
		description:
			"Start a review of a pull request now. Spends the user's provider credits. Returns queued (true when another run holds the pull request: this one starts when it ends, at the head as it is then; queuedBehind says whether that is a review round or a short dispute run), knownHeadSha (the head CodePanel last saw; a push it has not heard of yet may have moved it) and lastReviewedSha. Then call wait_for_review, or pass wait: true to block here until the new review finishes.",
		input: {
			repo,
			pr,
			panelId: panelId.optional(),
			traceparent: z
				.string()
				.optional()
				.describe(
					"Your W3C traceparent (00-<trace id>-<span id>-<flags>), if you trace your own work. Stored on the review and returned by get_review as traceparent, to join the review to your trace",
				),
			wait: z
				.boolean()
				.optional()
				.describe("Wait for the new review to finish and return it, as wait_for_review does"),
			timeoutSeconds,
		},
		writes: true,
		run: (c, { wait, timeoutSeconds: seconds, ...args }, context) =>
			wait ? triggerAndWait(c, args, waitOptions(context, seconds)) : c.triggerReview(args),
	}),
	...WAIT_TOOLS,
	...KNOWLEDGE_TOOLS,
	...LEARNING_TOOLS,
	...BRIEF_TOOLS,
	...QUALITY_TOOLS,
	...BUDGET_TOOLS,
	...SWITCH_TOOLS,
	...HANDOFF_TOOLS,
	tool({
		name: "set_review_rounds",
		title: "Set review rounds",
		description:
			'How many automatic review rounds this pull request gets, for ending or extending the fix-and-review loop. rounds: a number (this many in all), "+1" (at least one more after the current one), "stop" (none after the current one; it still posts), or "reset" (back to the repository\'s setting). Raising a limit the pull request had reached also reviews the current head if it was skipped. Same as commenting /rounds on the pull request. Returns the limit that now applies, the rounds done and whether a review was queued.',
		input: { repo, pr, rounds },
		writes: true,
		run: (c, a) => c.setRounds({ ...a, rounds: String(a.rounds) }),
	}),
	tool({
		name: "get_review",
		title: "Get review",
		description:
			"The current review of a pull request. Act on payload.nextAction: action is fix (the findings in refs), wait (a round or a dispute is under way), trigger (start one with trigger_review, which spends credits), rate (rate each ref with rate_finding), escalate (a person was asked to decide the refs: do not push or dispute for them; report it and stop), done or stop (report reason; do not retry in a loop), with refs and a reason. payload.findings lists every open finding (id, ref like F3, state new|open, answered, rated, dispute and evidence); the top-level findings list is a deprecated copy. payload.reviewedSha is the commit reviewed: right after a push it is still the previous one, so call wait_for_review with headSha first. gate.blocking says whether the merge gate still blocks. payload.pullRequest.state is open, merged or closed; once it is merged or closed, nextAction is done and openAtClose lists the findings it left open.",
		input: { repo, pr },
		writes: false,
		run: (c, a) => c.getReview(a.repo, a.pr),
	}),
	tool({
		name: "list_sessions",
		title: "List review sessions",
		description: "Recent review sessions, newest first, with status and any failure reason.",
		input: {
			repo: repo.optional(),
			status: z.enum(["active", "completed", "all"]).optional(),
			limit: z.number().int().positive().max(100).optional(),
		},
		writes: false,
		run: (c, a) => c.listSessions(a),
	}),
	tool({
		name: "get_session",
		title: "Get review session",
		description: "One review session, with each reviewer's status and error.",
		input: { id: z.string().describe("Session id, from list_sessions") },
		writes: false,
		run: (c, a) => c.getSession(a.id),
	}),
	tool({
		name: "list_findings",
		title: "List findings",
		description:
			"Findings on a pull request in the shape of get_review's payload.findings (id, ref like F3, state new|open|resolved|dismissed, answered, rated, dispute). Resolved and dismissed ones only if includeResolved.",
		input: { repo, pr, includeResolved: z.boolean().optional() },
		writes: false,
		run: (c, a) => c.listFindings(a),
	}),
	...FINDING_TOOLS,
];

/** Tools whose writes count differently from an agent than from the owner. */
const AGENT_NAMED = new Set([
	...AGENT_TOOLS,
	ADD_LEARNING_TOOL,
	RATE_LEARNING_TOOL,
	HANDOFF_TOOL,
	LOCAL_REVIEW_TOOL,
]);

/**
 * Ratings, dismissals, questions, learnings and handoffs through MCP come from an agent
 * by definition: when it does not name itself, the MCP client's own name
 * (from the initialize handshake) is used, so its word is counted as an
 * agent's and kept apart from the owner's, and its dismissals are disputes.
 */
export function withAgentName(
	def: ToolDef,
	args: Record<string, unknown>,
	clientName: string | undefined,
): Record<string, unknown> {
	if (!AGENT_NAMED.has(def.name) || args.agent !== undefined) return args;
	return { ...args, agent: clientName || "mcp" };
}
