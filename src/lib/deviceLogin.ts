/**
 * Device login for the CLI (RFC 8628 shape): ask the deployment for a code,
 * let the person approve it in their browser, poll until a token comes back.
 * See convex/device.ts and docs/api-and-agents.md.
 */
import { abortableSleep } from "./wait";

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const SLOW_DOWN_STEP_SECONDS = 5;
const MAX_NETWORK_FAILURES = 5;
const MS = 1000;
/** RFC 8628's defaults, for a server that leaves the fields out. */
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_EXPIRES_IN_SECONDS = 600;
const SERVER_ERROR = 500;
const TOO_MANY_REQUESTS = 429;

export interface DeviceCode {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	verificationUriComplete: string;
	expiresInSeconds: number;
	intervalSeconds: number;
}

export type LoginResult =
	| { status: "approved"; token: string; scopes: string[]; expiresInSeconds: number | null }
	| { status: "denied" }
	| { status: "expired" }
	| { status: "aborted" };

export interface LoginOptions {
	url: string;
	clientName: string;
	/** Space-separated; omit for the server's default (read and reviews:write). */
	scope?: string;
	signal?: AbortSignal;
	fetch?: typeof fetch;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
	/** Shows the person where to go. Called once and awaited, before polling. */
	onCode: (code: DeviceCode) => void | Promise<void>;
}

interface OAuthBody {
	error?: string;
	error_description?: string;
	interval?: number;
	access_token?: string;
	scope?: string;
	expires_in?: number;
}

interface Answer {
	status: number;
	/** Null when the reply was not JSON, as from something that is not a deployment. */
	body: OAuthBody | null;
	retryAfter: number | null;
}

/** Thrown by postJson when the signal fires, so callers can tell Ctrl-C from a failure. */
class Aborted extends Error {}

async function postJson(
	options: LoginOptions,
	path: string,
	body: Record<string, unknown>,
): Promise<Answer> {
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(`${base(options.url)}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: options.signal,
		});
	} catch (error) {
		if (options.signal?.aborted) throw new Aborted();
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not reach ${options.url}: ${reason}`, { cause: error });
	}
	const retry = Number(response.headers.get("retry-after"));
	const parsed: unknown = await response.json().catch(() => null);
	return {
		status: response.status,
		body: typeof parsed === "object" && parsed !== null ? (parsed as OAuthBody) : null,
		retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
	};
}

function base(url: string): string {
	return `${url.replace(/\/+$/, "")}/api/v1/device`;
}

function positive(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

async function requestDeviceCode(options: LoginOptions): Promise<DeviceCode> {
	const { status, body } = await postJson(options, "/code", {
		client_name: options.clientName,
		scope: options.scope,
	});
	if (body === null) {
		throw new Error(
			`${options.url} did not answer as a CodePanel deployment (HTTP ${status}). ` +
				"Use https://codepanel.ai, or your deployment's https://<name>.convex.site URL.",
		);
	}
	const raw = body as Record<string, unknown>;
	if (status !== 200 || typeof raw.device_code !== "string") {
		throw new Error(
			body.error_description ?? body.error ?? `Could not start login (HTTP ${status})`,
		);
	}
	const userCode = String(raw.user_code);
	const verificationUri = String(raw.verification_uri);
	return {
		deviceCode: raw.device_code,
		userCode,
		verificationUri,
		verificationUriComplete:
			typeof raw.verification_uri_complete === "string"
				? raw.verification_uri_complete
				: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`,
		expiresInSeconds: positive(raw.expires_in, DEFAULT_EXPIRES_IN_SECONDS),
		intervalSeconds: positive(raw.interval, DEFAULT_INTERVAL_SECONDS),
	};
}

/** Poll the token endpoint at the server's pace until it answers for good. */
export async function login(options: LoginOptions): Promise<LoginResult> {
	try {
		return await run(options);
	} catch (error) {
		if (error instanceof Aborted) return { status: "aborted" };
		throw error;
	}
}

/** What one answer from the token endpoint means for the poll loop. */
type Step =
	| { kind: "done"; result: LoginResult }
	| { kind: "wait"; interval: number }
	| { kind: "retry" };

function nextStep({ status, body, retryAfter }: Answer, interval: number): Step {
	const slower = () => {
		const next = Math.max(body?.interval ?? 0, interval + SLOW_DOWN_STEP_SECONDS);
		return { kind: "wait" as const, interval: Math.max(next, retryAfter ?? 0) };
	};
	// A rate limit in front of the deployment may answer 429 with no body.
	if (status === TOO_MANY_REQUESTS && !body?.error) return slower();
	// A proxy's 502 or an HTML error page is the network's fault, not the login's.
	if (body === null || (status >= SERVER_ERROR && !body.error)) return { kind: "retry" };
	if (status === 200 && body.access_token) {
		const result: LoginResult = {
			status: "approved",
			token: body.access_token,
			scopes: (body.scope ?? "").split(" ").filter(Boolean),
			expiresInSeconds: body.expires_in ?? null,
		};
		return { kind: "done", result };
	}
	switch (body.error) {
		case "authorization_pending":
			return { kind: "wait", interval };
		case "slow_down":
			return slower();
		case "access_denied":
			return { kind: "done", result: { status: "denied" } };
		case "expired_token":
		case "invalid_grant":
			return { kind: "done", result: { status: "expired" } };
		default:
			throw new Error(body.error_description ?? body.error ?? `Login failed (HTTP ${status})`);
	}
}

async function run(options: LoginOptions): Promise<LoginResult> {
	const sleep = options.sleep ?? abortableSleep;
	const now = options.now ?? Date.now;
	const code = await requestDeviceCode(options);
	const deadline = now() + code.expiresInSeconds * MS;
	await options.onCode(code);

	let interval = code.intervalSeconds;
	let failures = 0;
	for (;;) {
		// The server says when the code expires too, but a client that cannot
		// reach it must not wait forever, nor sleep past the expiry.
		await sleep(Math.min(interval * MS, Math.max(0, deadline - now())), options.signal);
		if (options.signal?.aborted) return { status: "aborted" };
		if (now() >= deadline) return { status: "expired" };

		let answer: Answer;
		try {
			answer = await postJson(options, "/token", {
				grant_type: GRANT_TYPE,
				device_code: code.deviceCode,
			});
		} catch (error) {
			if (error instanceof Aborted || ++failures > MAX_NETWORK_FAILURES) throw error;
			continue;
		}
		const step = nextStep(answer, interval);
		if (step.kind === "done") return step.result;
		if (step.kind === "retry") {
			if (++failures > MAX_NETWORK_FAILURES) {
				throw new Error(`Login failed: ${options.url} kept answering HTTP ${answer.status}.`);
			}
			continue;
		}
		failures = 0;
		interval = step.interval;
	}
}
