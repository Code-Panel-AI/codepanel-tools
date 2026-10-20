/**
 * Recommending a panel for a goal and applying it (GET /panels/recommend,
 * POST /panels/apply and /panels/restore).
 */
import { z } from "zod";
import { applyPanel, recommendPanel, restorePanel } from "../lib/panelPlanClient";
import { panelId, repo, tool } from "./define";

const level = z.enum(["low", "medium", "high"]);

const goal = {
	cost: level.optional().describe("How much to spend: picks the model tiers. Default medium"),
	quality: level.optional().describe("How thorough: picks the roles and effort. Default medium"),
	repo: repo.optional().describe("Set up this repository alone, priced from its own recent rounds"),
	panelId: panelId
		.optional()
		.describe("Without repo: the panel to change; default panel if left out"),
	roles: z.array(z.string()).optional().describe("Role ids from list_roles, instead of the goal's"),
	provider: z.string().optional().describe("Keep every seat on this provider"),
	maxUsdPerPr: z
		.number()
		.positive()
		.optional()
		.describe("Spend at most this per pull request; apply also sets it as the panel's limit"),
};

export const PANEL_PLAN_TOOLS = [
	tool({
		name: "get_panel_recommendation",
		title: "Recommend a review panel",
		description:
			'Recommend reviewers and an orchestrator for a goal, e.g. cost "low", quality "medium". Changes nothing. Each seat has its role, provider, model, effort, source (own_key or credits), usdPerRound and a reason citing what CodePanel measured. estimate has usdPerRound and usdPerPr with its basis (repo_history from the repository\'s recent rounds, or typical). budget says whether it fits maxUsdPerPr and what was cut to fit. target says which panel apply_panel would change; current is that panel now; unchanged and nextAction (apply or none) say whether applying would change anything.',
		input: goal,
		writes: false,
		run: (c, a) => recommendPanel(c, a),
	}),
	tool({
		name: "apply_panel",
		title: "Apply a recommended panel",
		description:
			"Apply get_panel_recommendation's recommendation for the same arguments: it is recomputed, then replaces the target panel's reviewers and the orchestrator's model in one step. With repo, only that repository changes: it gets its own panel if it has none. Returns the recommendation applied and undo; pass undo to restore_panel to put the panel back.",
		input: goal,
		writes: true,
		run: (c, a) => applyPanel(c, a),
	}),
	tool({
		name: "restore_panel",
		title: "Restore a panel",
		description:
			"Undo apply_panel: pass its undo object to bring back the panel's previous reviewers, orchestrator model and per-PR limit.",
		input: {
			undo: z.object({
				panelId: z.string(),
				reviewerIds: z.array(z.string()),
				orchestrator: z
					.object({
						provider: z.string(),
						modelId: z.string(),
						reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]).optional(),
					})
					.nullable(),
				budgetUsd: z.union([z.number().positive(), z.null(), z.literal("default")]),
			}),
		},
		writes: true,
		run: (c, a) => restorePanel(c, a.undo),
	}),
];
