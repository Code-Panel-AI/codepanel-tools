import { expect, test } from "bun:test";
import { parseArgs } from "../cli/args";
import { execute } from "../cli/run";
import { CodePanelClient } from "../lib/client";
import { HANDOFF_TOOLS } from "./handoffTool";

test("CLI and MCP forward explicit code authorship without replacing it with the submitter", async () => {
	const requests: unknown[] = [];
	const client = new CodePanelClient({
		url: "https://example.site",
		token: `cpk_${"a".repeat(43)}`,
		fetch: (async (_url: string, init: RequestInit) => {
			requests.push(JSON.parse(String(init.body)));
			return Response.json({ ok: true });
		}) as unknown as typeof fetch,
	});
	const args = {
		repo: "acme/app",
		pr: 7,
		text: "tested",
		sha: "a".repeat(40),
		agent: "review-bot",
		authorAgent: "Claude Code",
		authorModel: "Claude Opus 5.5",
	};
	const tool = HANDOFF_TOOLS[0];
	if (!tool) throw new Error("missing tool");
	await tool.run(client, args);
	await execute(
		parseArgs([
			"handoff",
			"acme/app#7",
			"--text",
			"tested",
			"--sha",
			args.sha,
			"--agent",
			args.agent,
			"--author-agent",
			args.authorAgent,
			"--author-model",
			args.authorModel,
		]).command,
		client,
	);
	expect(requests).toEqual([args, args]);
});
