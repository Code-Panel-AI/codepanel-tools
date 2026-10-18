/**
 * The monthly limits on own-key spend: the account budget across every
 * repository and a repository's own cap (GET and POST /api/v1/budget); and
 * credits auto-reload (GET and POST /api/v1/auto-reload).
 */
import { z } from "zod";
import { repo, tool } from "./define";

const amount = z.number().positive();

export const BUDGET_TOOLS = [
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
];
