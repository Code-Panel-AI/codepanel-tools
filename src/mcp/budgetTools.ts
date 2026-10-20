/**
 * The monthly limits on own-key spend: the account budget across every
 * repository and a repository's own cap (GET and POST /api/v1/budget); and
 * credits auto-reload (GET and POST /api/v1/auto-reload); and whether reviews
 * spend credits before own keys (GET and POST /api/v1/credits-first).
 */

import { z } from "zod";
import type { SpendReport } from "../lib/apiTypes";
import { getOptimization } from "../lib/optimizationClient";
import { repo, tool } from "./define";

const amount = z.number().positive();

export const BUDGET_TOOLS = [
	tool({
		name: "get_optimization",
		title: "Suggest repository review improvements",
		description:
			"Analyze a named repository's full-month spend, cost concentration, failed calls and verified quality alongside balanced and economy panel alternatives. Returns evidence-based suggestions, estimated cost differences and explicit repo-scoped apply/undo paths. Changes nothing, makes no LLM calls, and does not claim a source-code audit or guaranteed quality/savings. Use this from another repository's agent to inspect CodePanel's setup for that repo.",
		input: { repo },
		writes: false,
		run: (c, a) => getOptimization(c, a.repo),
	}),
	tool({
		name: "get_spend",
		title: "Explain repository spend",
		description:
			"Full UTC month recorded model costs by role, provider and model, including failed calls, own keys versus credits, unpriced calls and explicit itemization coverage. Subscription fees are separate. Use with get_quality and get_panel_recommendation to investigate value and optimize; do not infer savings from model price alone.",
		input: { repo },
		writes: false,
		run: (c, a) => c.request<SpendReport>("GET", "/spend", { repo: a.repo }),
	}),
	tool({
		name: "get_budget",
		title: "Get monthly budget",
		description:
			"The account's monthly budget (limitUsd, source default|custom|none) and, with repo, the repository's own cap (capUsd, null for none), each with this month's own-key spentUsd, heldUsd (running rounds) and remainingUsd, and status unlimited|open|reached|uncountable. repo.review says what the next round on it meets: status, remainingUsd, limitedBy (repo or account) and the refusal it would get.",
		input: { repo: repo.optional() },
		writes: false,
		run: (c, a) => c.getBudget(a.repo),
	}),
	tool({
		name: "set_budget",
		title: "Set monthly budget",
		description:
			"Set the account's monthly budget (monthlyUsd: an amount in USD, \"default\" for the $25 default, or null for no budget) and/or a repository's own monthly cap (repo with capUsd: an amount, or null to remove it so only the account budget applies). A repo cap is checked as well as the account budget, not instead of it. Counts only spend on your own provider keys; plans and credits are not changed. Returns the state before and after, as get_budget.",
		input: {
			monthlyUsd: z.union([amount, z.literal("default"), z.null()]).optional(),
			repo: repo.optional(),
			capUsd: amount.nullable().optional().describe("The repository's own cap; needs repo"),
		},
		writes: true,
		run: (c, a) => c.setBudget(a),
	}),
	tool({
		name: "get_auto_reload",
		title: "Get credits auto-reload",
		description:
			"Credits auto-reload: whether CodePanel charges the saved card for a credit pack when the credit balance falls below a threshold. status is off|on|pending (a charge running)|turned_off (by a failure: offReason card_declined|authentication_required|no_payment_method|payment_failed|disputed|stalled)|capped (this month's reloads reached monthlyCapUsd). With thresholdUsd, packUsd, chargeUsd (pack plus the purchase fee), monthlyCapUsd, reloadedUsd this month (UTC), lastReloadAt, and message: what to do next.",
		input: {},
		writes: false,
		run: (c) => c.getAutoReload(),
	}),
	tool({
		name: "set_auto_reload",
		title: "Set credits auto-reload",
		description:
			"Turn credits auto-reload on or off, or change it. When on, a balance below thresholdUsd charges the saved card for packUsd of credits plus the purchase fee, at most monthlyCapUsd of credits per calendar month (UTC); a reload that would pass the cap is skipped, not split. Needs a subscription to turn on. First enable defaults: threshold $5, pack $25, cap $100. Turning it on with the balance already below the threshold charges at once. Needs the budget:write scope. Returns the settings before and after, as get_auto_reload.",
		input: {
			enabled: z.boolean().optional(),
			thresholdUsd: amount.optional().describe("Reload when the balance falls below this"),
			packUsd: amount
				.optional()
				.describe("Credits each reload buys: one of get_auto_reload's packOptionsUsd"),
			monthlyCapUsd: amount
				.optional()
				.describe("Most credits reloads may buy per month; at least packUsd"),
		},
		writes: true,
		run: (c, a) => c.setAutoReload(a),
	}),
	tool({
		name: "get_credits_first",
		title: "Get credits-first",
		description:
			"Whether reviews spend CodePanel credits before your own provider keys (creditsFirst; source default|set, default on). With it on, a reviewer whose provider has both your valid key and CodePanel's runs on credits while the balance covers its reservation, and on your own key once it does not; a model with no credits price always uses your key. Off, your own key always wins. get_review's payload.keys says which key paid for each reviewer.",
		input: {},
		writes: false,
		run: (c) => c.getCreditsFirst(),
	}),
	tool({
		name: "set_credits_first",
		title: "Set credits-first",
		description:
			"Turn credits-first on or off (enabled: true|false), or null for the default (on). Applies from the next review round; a round never switches keys mid-call. Needs the budget:write scope. Returns the setting before and after, as get_credits_first.",
		input: { enabled: z.boolean().nullable() },
		writes: true,
		run: (c, a) => c.setCreditsFirst(a.enabled),
	}),
];
