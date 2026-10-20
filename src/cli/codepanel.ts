#!/usr/bin/env bun
/**
 * CodePanel CLI: set up and operate CodePanel without the dashboard.
 *
 *   bun tools/cli/codepanel.ts login                      (codepanel.ai)
 *   bun tools/cli/codepanel.ts login --url https://xyz.convex.site
 *   bun tools/cli/codepanel.ts help
 *
 * Or skip login and set CODEPANEL_URL and CODEPANEL_TOKEN (cpk_…).
 * See docs/api-and-agents.md.
 */
import { adminConfigFromEnv } from "../lib/adminClient";
import { CodePanelClient } from "../lib/client";
import { loadCredentials } from "../lib/credentials";
import { loadConfig } from "../lib/loadConfig";
import { SERVER_INFO } from "../mcp/shared";
import { adminNotice } from "./adminCommand";
import { parseArgs, USAGE, UsageError } from "./args";
import { errorText } from "./errorOutput";
import { runLogin, runLogout } from "./login";
import { execute, exitCodeFor, format } from "./run";

const SIGINT_EXIT_CODE = 130;
/**
 * After Ctrl-C, how long a command gets to wind down (a poll finishing, a
 * partial result printing) before the process exits anyway, so no read or
 * request that ignores the signal can keep it alive.
 */
const SIGINT_GRACE_MS = 1000;
/** How the CLI names itself to the server; it ships with the MCP server, so it shares its version. */
const CLI_CALLER = { client: "codepanel-cli", pluginVersion: SERVER_INFO.version };

async function main(argv: string[]): Promise<number> {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs(argv);
	} catch (error) {
		if (!(error instanceof UsageError)) throw error;
		console.error(`${error.message}\n\n${USAGE}`);
		return 2;
	}
	const { command } = parsed;

	if (command.kind === "help") {
		console.log(USAGE);
		return 0;
	}

	// Ctrl-C ends a login, a --wait, a request or a stdin read cleanly instead of
	// killing it mid-poll; a second Ctrl-C, no longer handled, kills the process.
	const abort = new AbortController();
	process.once("SIGINT", () => {
		abort.abort();
		setTimeout(() => process.exit(SIGINT_EXIT_CODE), SIGINT_GRACE_MS).unref();
	});

	try {
		if (command.kind === "logout") return await runLogout();
		if (command.kind === "login") return await runLogin(command, { signal: abort.signal });

		const config = command.kind.startsWith("admin.")
			? adminConfigFromEnv(process.env, await loadCredentials(process.env))
			: await loadConfig();
		const client = new CodePanelClient({ ...config, caller: () => CLI_CALLER }, abort.signal);
		const notice = command.kind === "admin.credit" ? adminNotice(command) : undefined;
		if (notice) console.error(notice);
		const result = await execute(command, client, { signal: abort.signal });
		console.log(parsed.json ? JSON.stringify(result, null, 2) : format(command, result));
		return abort.signal.aborted ? SIGINT_EXIT_CODE : exitCodeFor(command, result);
	} catch (error) {
		// An aborted request rejects with an AbortError; that is Ctrl-C, not a failure.
		if (abort.signal.aborted) return SIGINT_EXIT_CODE;
		console.error(errorText(error, parsed.json));
		return 1;
	}
}

process.exit(await main(process.argv.slice(2)));
