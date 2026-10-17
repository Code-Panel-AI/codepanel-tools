#!/usr/bin/env bun
/**
 * CodePanel MCP server.
 *
 * Lets a coding assistant set up and operate CodePanel: connect repositories,
 * edit the review panel, check which provider keys work, trigger a review,
 * follow its session, and read or dismiss findings. Every tool is a call to
 * the token-authenticated /api/v1; see docs/api-and-agents.md.
 *
 * Credentials come from the environment, else from `codepanel login`:
 *   CODEPANEL_URL    the Convex site URL, e.g. https://xyz.convex.site
 *   CODEPANEL_TOKEN  an API token from CodePanel Settings → API tokens (cpk_…);
 *                    personal, not a repository CI token
 * Run `bun tools/cli/codepanel.ts login` once and neither variable is needed.
 *
 * Give the token only the scopes the assistant needs: `read` to look,
 * `reviews:write` to trigger reviews and dismiss findings, `repos:write` and
 * `panel:write` for setup, `budget:write` to change the monthly limits.
 *
 * Example client config (Claude Code):
 *   claude mcp add codepanel -e CODEPANEL_URL=... -e CODEPANEL_TOKEN=... -- bun tools/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CodePanelClient } from "../lib/client";
import { loadConfig } from "../lib/loadConfig";
import { exitWhenClosed } from "./lifecycle";
import { progressReporter } from "./progress";
import { runTool } from "./run";
import { SERVER_INFO, SERVER_INSTRUCTIONS, toolAnnotations } from "./shared";
import { TOOLS, withAgentName } from "./tools";

let client: CodePanelClient;
try {
	client = new CodePanelClient(await loadConfig());
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

for (const def of TOOLS) {
	server.registerTool(
		def.name,
		{
			title: def.title,
			description: def.description,
			inputSchema: def.input,
			annotations: toolAnnotations(def),
		},
		(args: Record<string, unknown>, extra) =>
			runTool(def, client, withAgentName(def, args, server.server.getClientVersion()?.name), {
				signal: extra.signal,
				progress: progressReporter(extra),
			}),
	);
}

// The transport closes itself on a bad frame; with no client left the process has nothing to do.
server.server.onclose = () => process.exit(0);
await server.connect(new StdioServerTransport());
exitWhenClosed(process.stdin, () => server.close(), process.exit);
