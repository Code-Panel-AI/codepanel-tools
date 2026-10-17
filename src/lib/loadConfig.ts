// Kept apart from client.ts because it reads the disk: the remote MCP endpoint
// bundles client.ts into Convex's default runtime, which has no node:fs.
import { type ClientConfig, configFromEnv } from "./client";
import { loadCredentials } from "./credentials";

/** `configFromEnv` with the saved login read from disk. */
export async function loadConfig(
	env: Record<string, string | undefined> = process.env,
): Promise<ClientConfig> {
	return configFromEnv(env, await loadCredentials(env));
}
