interface Suggestion {
	title: string;
	evidence: string;
	action: string;
}

/** A portable handoff: the agent combines recorded evidence with the checkout it can read. */
export function optimizationPrompt(repo: string, suggestions: readonly Suggestion[]): string {
	return [
		`# Improve review value for ${repo}`,
		"",
		"Work in this repository. Reduce total review cost and author effort while preserving detection of consequential bugs.",
		"",
		"## Recorded observations (refresh before acting)",
		...(suggestions.length
			? suggestions.flatMap((s) => [
					`- **${s.title}:** ${s.evidence}`,
					`  Investigate: ${s.action}`,
				])
			: [
					"- No specific cost anomaly was flagged. Fetch current spend and quality evidence first.",
				]),
		"",
		"## Investigation",
		`1. Run \`codepanel optimize ${repo} --json\` (or MCP \`get_optimization\`) and save the current panel and settings for undo. Refresh spend with \`get_spend\` or the CLI.`,
		"2. Read AGENTS.md, .codepanel/rules.md, architecture, critical paths, and tests. Check rules against current source; identify contradictions instead of enforcing stale guidance.",
		"3. Trace expensive PRs and rounds. Separate consolidation, dispute judging, tool turns, failed calls, prompt caching, and repeat triggers. State any attribution or history limits.",
		"4. Inspect confirmed useful findings, withdrawn disputes, and recurring noise by role/model. Disputed findings are a selected sample, not overall review accuracy. Check callers and shared components before asserting a defect.",
		"5. Check authorship and independence. Missing agent markers mean unknown, never human. Declare the actual tool/model as plain-text Authoring agent: and Authoring model: lines in the PR description. If author, reviewers and dispute judge share a family, test an independent family; multiple Claude models are not independent families.",
		"",
		"## Proposed change and proof",
		"- Prefer the smallest repo-specific change. Preserve useful roles and custom instructions; a generic panel replacement can remove both. Compare balanced and economy estimates only as candidates, not quality guarantees.",
		"- Replay representative confirmed bugs and clean changes against the baseline before reducing model capability or coverage. Include money, authorization, privacy and state transitions where relevant. Report misses, false positives, latency, and actual call cost with sample limits.",
		"- Apply only evidence-supported changes to this repository with the panel/settings tools. Save the exact undo operation and verify persisted configuration. Do not raise budgets or change subscriptions.",
		"- Report observed savings separately from estimates. Compare subsequent cost per reviewed PR and per confirmed useful finding, repeated rounds and author rebuttals; restore the baseline if critical misses or noise increase.",
	].join("\n");
}
