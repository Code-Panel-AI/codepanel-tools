import type { RepoAuthorship, SpendReport } from "./apiTypes";
import type { CodePanelClient } from "./client";
import { optimizationPrompt } from "./optimizationPrompt";
import { recommendPanel } from "./panelPlanClient";

/** Authenticate and resolve the repo first; optional diagnostic failures must not erase its spend. */
export async function getOptimization(client: CodePanelClient, repo: string) {
	const spend = await client.request<SpendReport>("GET", "/spend", { repo });
	const [quality, providers, balanced, economy, authorship] = await Promise.allSettled([
		client.getQuality(repo),
		client.keyStatus(),
		recommendPanel(client, { repo, cost: "low", quality: "medium" }),
		recommendPanel(client, { repo, cost: "low", quality: "low" }),
		client.request<RepoAuthorship>("GET", "/authorship", { repo }),
	]);
	const diagnosticErrors = [
		...(authorship.status === "rejected"
			? [
					{
						component: "authorship",
						message:
							"Authorship diagnostics could not load. Do not assume the code was human-written or independently reviewed.",
					},
				]
			: []),
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
		markdownPrompt: optimizationPrompt(spend.repo, spend.suggestions),
		quality: quality.status === "fulfilled" ? quality.value : null,
		authorship: authorship.status === "fulfilled" ? authorship.value : null,
		diagnosticErrors,
		analysisSteps: [
			"In the target repository, read its agent guidance, architecture, critical paths and tests. Use that source context to choose reviewer roles; this report does not inspect source code.",
			"Compare quality.byModel and quality.byRole when available, including verified sample sizes and uncertainty. Do not infer that an unmeasured model improves this codebase.",
			"Prioritize spend.suggestions and the largest cost roles, and inspect convergence for repeated rounds before replacing reviewers.",
			"Preview the tradeoff, apply only to the named repository through the panel tools, save undo, then compare subsequent spend and verified quality.",
		],
		configurationIssues: [
			...(providers.status === "fulfilled"
				? providers.value
						.filter((p) => p.configured && p.status !== "valid")
						.map((p) => ({
							provider: p.provider,
							status: p.status,
							action: "Check this provider in Settings before relying on its models.",
						}))
				: []),
			...(authorship.status === "fulfilled" && authorship.value.sameAuthorFamilyRounds > 0
				? [
						{
							provider: "panel",
							status: "same_author_family",
							action: `${authorship.value.sameAuthorFamilyRounds} of ${authorship.value.sampledRounds} recent rounds used the author's identified family for all reviewers and the orchestrator. Evaluate an independent family before claiming independent review.`,
						},
					]
				: []),
			...(authorship.status === "fulfilled" && authorship.value.unknownAuthorRounds > 0
				? [
						{
							provider: "authorship",
							status: "unknown_author",
							action: `${authorship.value.unknownAuthorRounds} recent rounds lack agent-family attribution. Add plain-text Authoring agent: and Authoring model: declarations to PR descriptions; missing markers do not establish human authorship.`,
						},
					]
				: []),
		],
		alternatives: {
			balanced: balanced.status === "fulfilled" ? balanced.value : null,
			economy: economy.status === "fulfilled" ? economy.value : null,
		},
		nextAction: unavailable
			? "Some diagnostics or panel alternatives are unavailable. Inspect diagnosticErrors and provider health, then retry. The spend report remains available. No settings changed."
			: `Review spend.suggestions and verified quality, then compare alternatives. Apply with codepanel panel apply --repo ${repo} --cost low --quality medium (balanced) or --quality low (economy), or MCP apply_panel with the same arguments. These replace reviewers and the orchestrator; inspect the roles and save undo. No settings changed.`,
	};
}
