/**
 * `codepanel login` and `codepanel logout`: the commands that need no token.
 */
import { homedir, hostname } from "node:os";
import { openBrowser } from "../lib/browser";
import { CodePanelClient } from "../lib/client";
import { apiUrlFor, HOSTED_API_URL, HOSTED_SITE_URL } from "../lib/clientConfig";
import {
	clearCredentials,
	credentialsPath,
	loadCredentials,
	saveCredentials,
} from "../lib/credentials";
import { type DeviceCode, type LoginResult, login } from "../lib/deviceLogin";
import type { Command } from "./args";

const MS = 1000;
/** What a shell reports for a command ended by Ctrl-C. */
const SIGINT_EXIT_CODE = 130;
const SECONDS_PER_MINUTE = 60;
const BOLD = "\x1b[1m";
const RESET_BOLD = "\x1b[22m";

type LoginCommand = Extract<Command, { kind: "login" }>;
type Say = (line: string) => void;

export interface LoginIo {
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	signal?: AbortSignal;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	/** Where the instructions go: stdout, since they are what the person came for. */
	say?: (line: string) => void;
	/** Whether `say` reaches a terminal, which gets the code in bold. */
	isTTY?: boolean;
	/** Where failures and warnings go: stderr. */
	warn?: (line: string) => void;
	/** Opens a link in the browser; false when it could not. */
	openBrowser?: (url: string) => Promise<boolean>;
}

/** The deployment a login signs in to, and what chose it, to say so. */
export interface LoginTarget {
	url: string;
	source: "--url" | "CODEPANEL_URL" | "your last login" | "default";
}

/** The same path with the home directory shortened to ~, as people write it. */
function tildePath(path: string): string {
	const home = homedir();
	return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

async function announce(
	code: DeviceCode,
	io: { say: (line: string) => void; bold: (text: string) => string; open: LoginIo["openBrowser"] },
): Promise<void> {
	const minutes = Math.round(code.expiresInSeconds / SECONDS_PER_MINUTE);
	const link = code.verificationUriComplete;
	io.say(`Your one-time code: ${io.bold(code.userCode)}\n`);
	const opened = io.open ? await io.open(link) : false;
	io.say(
		opened
			? `Opened this link in your browser (open it yourself if no tab appeared):\n\n  ${link}\n`
			: `Open this link in your browser:\n\n  ${link}\n`,
	);
	io.say(
		"Check that the page shows the same code, then approve. Approve only a sign-in you started.",
	);
	io.say(`Waiting for approval (the code expires in ${minutes} minutes)...`);
}

/** The flag, then the environment, then the last login, then codepanel.ai. */
export async function resolveUrl(
	command: LoginCommand,
	env: Record<string, string | undefined>,
): Promise<LoginTarget> {
	if (command.url) return { url: apiUrlFor(command.url), source: "--url" };
	const fromEnv = env.CODEPANEL_URL?.trim();
	if (fromEnv) return { url: apiUrlFor(fromEnv), source: "CODEPANEL_URL" };
	const saved = (await loadCredentials(env))?.url;
	if (saved) return { url: apiUrlFor(saved), source: "your last login" };
	return { url: HOSTED_API_URL, source: "default" };
}

const nameOf = (url: string) => (url === HOSTED_API_URL ? "codepanel.ai" : url);
const fromWhere = ({ source }: LoginTarget) => (source === "default" ? "" : ` (from ${source})`);

/**
 * Why the link the deployment sent cannot work, or null when it can. A
 * deployment without SITE_URL links to codepanel.ai, whose page looks codes
 * up in codepanel.ai's own deployment and so would never find this one.
 */
export function linkMismatch(code: DeviceCode, target: LoginTarget): string | null {
	let site: string;
	try {
		site = new URL(code.verificationUri).origin;
	} catch {
		return null;
	}
	if (site !== HOSTED_SITE_URL || target.url === HOSTED_API_URL) return null;
	const unset = target.source === "CODEPANEL_URL" ? ", and unset CODEPANEL_URL" : "";
	return [
		`Stopped before opening the browser: ${target.url}${fromWhere(target)} sent a ${site}/device link, ` +
			`but ${site} signs in through ${HOSTED_API_URL}, so its page would say the code isn't valid.`,
		`- To sign in to codepanel.ai: codepanel login --url ${HOSTED_SITE_URL}${unset}.`,
		`- To sign in to ${target.url}: set SITE_URL on that deployment to the site that serves its /device page.`,
	].join("\n");
}

/** Variables that will win over the login just saved, so the person is not surprised later. */
function overrides(env: Record<string, string | undefined>, url: string): string[] {
	const lines: string[] = [];
	if (env.CODEPANEL_TOKEN?.trim()) {
		lines.push(
			"CODEPANEL_TOKEN is set in this shell and wins over the saved login; unset it to use this one.",
		);
	}
	const envUrl = env.CODEPANEL_URL?.trim();
	if (envUrl && apiUrlFor(envUrl) !== url) {
		lines.push(
			`CODEPANEL_URL is set to ${envUrl}, so other commands use that deployment, not this login; unset it to use this one.`,
		);
	}
	return lines;
}

interface FinishIo {
	env: Record<string, string | undefined>;
	fetch?: typeof fetch;
	signal?: AbortSignal;
	say: Say;
	warn: Say;
}

/** Save the approved token; the path, or null after saying why it could not be saved. */
async function save(
	target: LoginTarget,
	result: Extract<LoginResult, { status: "approved" }>,
	io: FinishIo,
): Promise<string | null> {
	const now = Date.now();
	const credentials = {
		url: target.url,
		token: result.token,
		scopes: result.scopes,
		expiresAt: result.expiresInSeconds ? now + result.expiresInSeconds * MS : undefined,
		savedAt: now,
	};
	try {
		return await saveCredentials(credentials, io.env);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		io.warn(
			`Approved, but the login could not be saved to ${tildePath(credentialsPath(io.env))}: ${reason}. ` +
				"Make that directory writable (or set CODEPANEL_CONFIG_DIR) and run `codepanel login` again; " +
				"revoke the unused token in Settings → API tokens.",
		);
		return null;
	}
}

async function finish(
	target: LoginTarget,
	result: Extract<LoginResult, { status: "approved" }>,
	io: FinishIo,
): Promise<number> {
	const path = await save(target, result, io);
	if (path === null) return 1;
	const saved = `(${result.scopes.join(", ")}). Saved to ${tildePath(path)}.`;
	const client = new CodePanelClient(
		{ url: target.url, token: result.token, fetch: io.fetch },
		io.signal,
	);
	try {
		const me = await client.me();
		io.say(`\nSigned in as ${me.githubUsername ?? "unknown"} ${saved}`);
	} catch (error) {
		// The token is saved and good; only the greeting failed, or was cut short.
		if (io.signal?.aborted) {
			io.say(`\nSigned in ${saved}`);
			return SIGINT_EXIT_CODE;
		}
		const reason = error instanceof Error ? error.message : String(error);
		io.say(`\nSigned in ${saved} Could not look up the account just now: ${reason}`);
	}
	for (const line of overrides(io.env, target.url)) io.warn(line);
	return 0;
}

/** Run the device flow and save the token. Returns the process exit code. */
export async function runLogin(command: LoginCommand, io: LoginIo = {}): Promise<number> {
	const env = io.env ?? process.env;
	const say = io.say ?? ((line: string) => console.log(line));
	const warn = io.warn ?? ((line: string) => console.error(line));
	const tty = (io.isTTY ?? process.stdout.isTTY) && !env.NO_COLOR;
	const bold = (text: string) => (tty ? `${BOLD}${text}${RESET_BOLD}` : text);
	const open = io.openBrowser ?? ((link: string) => openBrowser(link, { env }));
	const target = await resolveUrl(command, env);
	say(`Signing in to ${nameOf(target.url)}${fromWhere(target)}.`);
	const result = await login({
		url: target.url,
		clientName: command.name ?? `codepanel CLI on ${hostname()}`,
		scope: command.scopes
			?.split(/[\s,]+/)
			.filter(Boolean)
			.join(" "),
		signal: io.signal,
		fetch: io.fetch,
		sleep: io.sleep,
		onCode: (code) => {
			const mismatch = linkMismatch(code, target);
			if (mismatch) throw new Error(mismatch);
			return announce(code, { say, bold, open });
		},
	});

	switch (result.status) {
		case "approved":
			return finish(target, result, { env, fetch: io.fetch, signal: io.signal, say, warn });
		case "denied":
			warn("The login was denied in the browser.");
			return 1;
		case "expired":
			warn("The code expired before it was approved. Run `codepanel login` again.");
			return 1;
		case "aborted":
			warn("Login cancelled.");
			return SIGINT_EXIT_CODE;
	}
}

/** Forget the saved login. The token itself stays valid until revoked in Settings. */
export async function runLogout(env: Record<string, string | undefined> = process.env) {
	const had = await clearCredentials(env);
	console.log(
		had
			? `Signed out: removed ${credentialsPath(env)}. Revoke the token in Settings → API tokens to disable it.`
			: "No saved login.",
	);
	return 0;
}
