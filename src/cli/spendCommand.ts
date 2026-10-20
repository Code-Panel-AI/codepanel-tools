import type { SpendReport } from "../lib/apiTypes";
import type { CodePanelClient } from "../lib/client";
import { getOptimization } from "../lib/optimizationClient";
import { formatPanelPlan } from "./panelPlanCommand";
import { formatQuality } from "./qualityCommand";

export type SpendCommand = { kind: "spend" | "optimize"; repo: string };

export async function executeSpend(command: SpendCommand, client: CodePanelClient) {
	if (command.kind === "optimize") return getOptimization(client, command.repo);
	return client.request<SpendReport>("GET", "/spend", { repo: command.repo });
}

export function formatSpendReport(report: SpendReport): string {
	const usd = (n: number) => `$${n.toFixed(2)}`;
	return [
		`${report.repo}, ${report.month} (UTC): ${usd(report.totalUsd)} recorded model cost, ${report.calls} calls.`,
		`${usd(report.ownKeyUsd)} on own keys; ${usd(report.creditsUsd)} on CodePanel credits. Subscription fees are separate.`,
		`Model itemization: ${report.itemizedCalls}/${report.calls} calls${report.complete ? " (complete)" : " (incomplete)"}; ${report.unpricedCalls} unpriced calls.`,
		...report.byModel.map(
			(r) =>
				`  ${r.role} ${r.provider}/${r.modelId}: ${usd(r.usd)}, ${r.calls} calls, ${r.failedCalls} unusable`,
		),
		...report.suggestions.map((s) => `${s.title}: ${s.evidence} ${s.action}`),
		report.nextAction,
		`Analyze cost and quality together: codepanel optimize ${report.repo} --json`,
	].join("\n");
}

export function formatOptimization(report: Awaited<ReturnType<typeof getOptimization>>): string {
	return [
		formatSpendReport(report.spend),
		report.quality ? formatQuality(report.quality) : "Quality diagnostics unavailable.",
		...report.diagnosticErrors.map((e) => `${e.component}: ${e.message}`),
		...Object.entries(report.alternatives).map(([name, panel]) =>
			panel
				? `${name} alternative:\n${formatPanelPlan({ kind: "panel.recommend", repo: report.spend.repo }, panel)}`
				: `${name} alternative unavailable.`,
		),
		report.nextAction,
		`\nCopyable Markdown prompt:\n\n${report.markdownPrompt}`,
	].join("\n");
}
