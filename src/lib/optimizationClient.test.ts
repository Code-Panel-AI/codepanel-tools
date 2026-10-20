import { expect, test } from "bun:test";
import type { SpendReport } from "./apiTypes";
import { CodePanelClient } from "./client";
import { getOptimization } from "./optimizationClient";

const spend: SpendReport = {
	repo: "u/app",
	month: "2026-10",
	totalUsd: 8,
	ownKeyUsd: 8,
	creditsUsd: 0,
	calls: 2,
	unpricedCalls: 0,
	itemizedCalls: 2,
	complete: true,
	groupLimitReached: false,
	byModel: [],
	suggestions: [],
	nextAction: "Compare quality.",
};

test("quality and provider failures preserve spend and explicitly identify unavailable diagnostics", async () => {
	const client = new CodePanelClient({
		url: "https://deployment.test",
		token: `cpk_${"a".repeat(43)}`,
		fetch: (async (url: string) =>
			url.includes("/spend?")
				? Response.json(spend)
				: Response.json({ error: "unavailable" }, { status: 503 })) as typeof fetch,
	});
	const report = await getOptimization(client, "u/app");
	expect(report.spend.totalUsd).toBe(8);
	expect(report.quality).toBeNull();
	expect(report.diagnosticErrors.map((e) => e.component)).toEqual(["quality", "providers"]);
	expect(report.alternatives).toEqual({ balanced: null, economy: null });
	expect(report.nextAction).toContain("spend report remains available");
});
