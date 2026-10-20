import type { SpendReport } from "./apiTypes";
import type { CodePanelClient } from "./client";
import { recommendPanel } from "./panelPlanClient";

/** Authenticate and resolve the repo first; optional diagnostic failures must not erase its spend. */
export async function getOptimization(client: CodePanelClient, repo: string) {
	const spend = await client.request<SpendReport>("GET", "/spend", { repo });
	const [quality, providers, balanced, economy] = await Promise.allSettled([
		client.getQuality(repo),
		client.keyStatus(),
		recommendPanel(client, { repo, cost: "low", quality: "medium" }),
		recommendPanel(client, { repo, cost: "low", quality: "low" }),
	]);
	const diagnosticErrors = [
		...(quality.status === "rejected"
			? [
					{
						component: "quality",
						message: "Quality diagnostics could not load. Retry before judging review value.",
					},
				]
			: []),
		...(providers.status === "rejected"
			? [
					{
						component: "providers",
						message: "Provider health could not load. Retry before changing models.",
					},
				]
			: []),
	];
	const unavailable =
		diagnosticErrors.length > 0 || balanced.status === "rejected" || economy.status === "rejected";
	return {
		spend,
		quality: quality.status === "fulfilled" ? quality.value : null,
		diagnosticErrors,
		analysisSteps: [
			"In the target repository, read its agent guidance, architecture, critical paths and tests. Use that source context to choose reviewer roles; this report does not inspect source code.",
			"Compare quality.byModel and quality.byRole when available, including verified sample sizes and uncertainty. Do not infer that an unmeasured model improves this codebase.",
			"Prioritize spend.suggestions and the largest cost roles, and inspect convergence for repeated rounds before replacing reviewers.",
			"Preview the tradeoff, apply only to the named repository through the panel tools, save undo, then compare subsequent spend and verified quality.",
		],
		configurationIssues:
			providers.status === "fulfilled"
				? providers.value
						.filter((p) => p.configured && p.status !== "valid")
						.map((p) => ({
							provider: p.provider,
							status: p.status,
							action: "Check this provider in Settings before relying on its models.",
						}))
				: [],
		alternatives: {
			balanced: balanced.status === "fulfilled" ? balanced.value : null,
			economy: economy.status === "fulfilled" ? economy.value : null,
		},
		nextAction: unavailable
			? "Some diagnostics or panel alternatives are unavailable. Inspect diagnosticErrors and provider health, then retry. The spend report remains available. No settings changed."
			: `Review spend.suggestions and verified quality, then compare alternatives. Apply with codepanel panel apply --repo ${repo} --cost low --quality medium (balanced) or --quality low (economy), or MCP apply_panel with the same arguments. These replace reviewers and the orchestrator; inspect the roles and save undo. No settings changed.`,
	};
}
