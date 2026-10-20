import { expect, test } from "bun:test";
import { CodePanelClient } from "./client";
import { getOptimization } from "./optimizationClient";

test("an agent still gets a repo-specific evidence handoff when optional diagnostics fail", async () => {
	const client = new CodePanelClient({
		url: "https://deployment.test",
		token: `cpk_${"a".repeat(43)}`,
		fetch: (async (url: string) =>
			url.includes("/spend?")
				? Response.json({
						repo: "owner/project",
						month: "2026-10",
						totalUsd: 100,
						suggestions: [
							{
								title: "Orchestration",
								evidence: "$82 across 300 calls",
								action: "Trace round triggers.",
							},
						],
					})
				: Response.json({ error: "unavailable" }, { status: 503 })) as typeof fetch,
	});
	const result = await getOptimization(client, "owner/project");
	expect(result.markdownPrompt).toContain("# Improve review value for owner/project");
	expect(result.markdownPrompt).toContain("$82 across 300 calls");
	expect(result.markdownPrompt).toContain("codepanel optimize owner/project --json");
	expect(result.markdownPrompt).toContain("save");
	expect(result.markdownPrompt).toContain("selected sample, not overall review accuracy");
	expect(result.diagnosticErrors).toHaveLength(2);
});
