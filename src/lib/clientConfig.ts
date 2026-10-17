/**
 * Where the CLI and MCP server find their deployment and token, and the
 * caller's trace context. Re-exported from ./client.
 */
import type { StoredCredentials } from "./credentials";

const TOKEN_PATTERN = /^cpk_[A-Za-z0-9_-]{43}$/;

/**
 * The API of the hosted service, codepanel.ai: its Convex deployment's site
 * URL, which serves /api/v1. `codepanel login` uses it when nothing names a
 * deployment; a self-hosted one is chosen with --url or CODEPANEL_URL.
 */
export const HOSTED_API_URL = "https://zealous-schnauzer-450.convex.site";
/**
 * The hosted site, where the /device page that approves logins lives: the
 * server's DEFAULT_SITE_URL (convex/lib/reviewLinks.ts, kept equal by a
 * test), the site a deployment links to when SITE_URL is unset.
 */
export const HOSTED_SITE_URL = "https://codepanel.ai";

const HOSTED_SITE_HOSTS = new Set(["codepanel.ai", "www.codepanel.ai"]);
/** Hosts plain http may reach: a deployment on this machine, as in local development. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** A Convex deployment serves its functions on .convex.cloud and its HTTP routes on .convex.site. */
const CONVEX_CLOUD_HOST = /\.convex\.cloud$/;

/**
 * The API URL a person meant: trimmed, without trailing slashes, and with
 * the two easy mix-ups corrected. codepanel.ai is the site, whose API is
 * HOSTED_API_URL; a deployment's .convex.cloud URL serves no HTTP routes,
 * its .convex.site twin does. Throws on anything that is not an https URL,
 * or http to this machine.
 */
export function apiUrlFor(raw: string): string {
	const trimmed = raw.trim().replace(/\/+$/, "");
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(
			`"${raw}" is not a URL. Use https://codepanel.ai or https://<deployment>.convex.site.`,
		);
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error(`"${raw}" is not an http(s) URL.`);
	}
	// The device flow and every later request carry the token.
	if (parsed.protocol === "http:" && !LOCAL_HOSTS.has(parsed.hostname)) {
		throw new Error(`"${raw}" would send your token unencrypted. Use https://.`);
	}
	if (HOSTED_SITE_HOSTS.has(parsed.hostname)) return HOSTED_API_URL;
	if (CONVEX_CLOUD_HOST.test(parsed.hostname)) {
		return trimmed.replace(parsed.host, parsed.host.replace(CONVEX_CLOUD_HOST, ".convex.site"));
	}
	return trimmed;
}

export interface ClientConfig {
	url: string;
	token: string;
	fetch?: typeof fetch;
	/**
	 * The caller's W3C traceparent, sent with every review it triggers so the
	 * review can be joined to the caller's trace. From $TRACEPARENT, the
	 * OpenTelemetry convention for passing trace context to a child process.
	 */
	traceparent?: string;
}

/**
 * Mirrors the rules of parseTraceparent in convex/lib/traceparent.ts, which
 * the tools cannot import: this shape, less RESERVED_TRACEPARENT. Upper-case
 * hex passes here as there; the server lower-cases it.
 */
const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i;

/** Values of the right shape that W3C Trace Context reserves as invalid. */
const RESERVED_TRACEPARENT = /^ff-|^[0-9a-f]{2}-0{32}-|-0{16}-[0-9a-f]{2}$/i;

/** A traceparent from the environment, or undefined when it is absent, malformed or reserved. */
export function traceparentFromEnv(env: Record<string, string | undefined>): string | undefined {
	const value = env.TRACEPARENT?.trim();
	if (!value || !TRACEPARENT_PATTERN.test(value) || RESERVED_TRACEPARENT.test(value))
		return undefined;
	return value;
}

const NOT_SIGNED_IN =
	"Not signed in. Run `codepanel login`, or set CODEPANEL_URL (your deployment's .convex.site URL) " +
	"and CODEPANEL_TOKEN (an API token from Settings → API tokens).";

/** Whether two URLs name one deployment; false when either is not a URL, as a hand-edited file may hold. */
function sameDeployment(a: string, b: string): boolean {
	try {
		return apiUrlFor(a) === apiUrlFor(b);
	} catch {
		return false;
	}
}

/**
 * Where the CLI and MCP server get their URL and token: the environment
 * first, then what `codepanel login` saved. A saved token is used only with
 * the deployment it was issued by, so setting CODEPANEL_URL to another
 * deployment never sends it a token it did not issue.
 */
export function configFromEnv(
	env: Record<string, string | undefined> = process.env,
	stored: StoredCredentials | null = null,
	now: number = Date.now(),
): ClientConfig {
	const envUrl = env.CODEPANEL_URL?.trim();
	const url = envUrl ? apiUrlFor(envUrl) : stored?.url;
	const envToken = env.CODEPANEL_TOKEN?.trim();
	const usable = stored && url && sameDeployment(stored.url, url) ? stored : null;
	if (!envToken && usable?.expiresAt !== undefined && usable.expiresAt <= now) {
		throw new Error("Your saved login has expired. Run `codepanel login` again.");
	}
	const token = envToken || usable?.token;
	if (!url || !token) throw new Error(NOT_SIGNED_IN);
	if (!TOKEN_PATTERN.test(token)) {
		throw new Error(
			"CODEPANEL_TOKEN must be an API token from Settings → API tokens (it starts with cpk_). " +
				"Webhook secrets are no longer accepted.",
		);
	}
	return { url, token, traceparent: traceparentFromEnv(env) };
}
