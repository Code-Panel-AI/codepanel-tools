import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOSTED_API_URL } from "../lib/clientConfig";
import { loadCredentials, saveCredentials } from "../lib/credentials";
import { linkMismatch, resolveUrl, runLogin } from "./login";

const TOKEN = `cpk_${"a".repeat(43)}`;
const LINK = "https://codepanel.ai/device?user_code=BCDF-GHJK";

let dir: string;
let env: Record<string, string>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "codepanel-login-"));
	env = { CODEPANEL_CONFIG_DIR: join(dir, "cfg") };
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const login = (url?: string) => ({ kind: "login" as const, url, scopes: undefined, name: "test" });

/**
 * A deployment that issues a code for `site`'s /device page, approves it on
 * the first poll and answers /me (unless `meFails`).
 */
function fakeDeployment(
	calls: string[],
	options: { site?: string; meFails?: boolean } = {},
): typeof fetch {
	const site = options.site ?? "https://codepanel.ai";
	const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
	return (async (input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		if (url.endsWith("/device/code")) {
			return json({
				device_code: "dc",
				user_code: "BCDF-GHJK",
				verification_uri: `${site}/device`,
				verification_uri_complete: `${site}/device?user_code=BCDF-GHJK`,
				expires_in: 600,
				interval: 5,
			});
		}
		if (url.endsWith("/device/token")) {
			return json({ access_token: TOKEN, scope: "read reviews:write", expires_in: 60 });
		}
		if (options.meFails) throw new TypeError("fetch failed");
		return json({ githubUsername: "octocat" });
	}) as typeof fetch;
}

interface RunOptions {
	isTTY?: boolean;
	url?: string;
	site?: string;
	meFails?: boolean;
}

async function run(opened: boolean, extra: RunOptions = {}) {
	const lines: string[] = [];
	const warnings: string[] = [];
	const calls: string[] = [];
	const openedLinks: string[] = [];
	const code = await runLogin(login(extra.url), {
		env,
		fetch: fakeDeployment(calls, extra),
		sleep: async () => {},
		say: (line) => lines.push(line),
		warn: (line) => warnings.push(line),
		isTTY: extra.isTTY ?? false,
		openBrowser: async (link) => {
			openedLinks.push(link);
			return opened;
		},
	});
	return { code, out: lines.join("\n"), warnings, calls, openedLinks };
}

describe("which deployment login uses", () => {
	test("codepanel.ai when nothing names one", async () => {
		const hosted = { url: HOSTED_API_URL, source: "default" } as const;
		expect(await resolveUrl(login(), env)).toEqual(hosted);
		expect(await resolveUrl(login(), { ...env, CODEPANEL_URL: "  " })).toEqual(hosted);
	});

	test("--url, then CODEPANEL_URL, then the saved login", async () => {
		await saveCredentials({ url: "https://saved.convex.site", token: TOKEN, savedAt: 1 }, env);
		expect(await resolveUrl(login(), env)).toEqual({
			url: "https://saved.convex.site",
			source: "your last login",
		});
		const withEnv = { ...env, CODEPANEL_URL: "https://env.convex.site/" };
		expect(await resolveUrl(login(), withEnv)).toEqual({
			url: "https://env.convex.site",
			source: "CODEPANEL_URL",
		});
		expect(await resolveUrl(login("https://flag.convex.site"), withEnv)).toEqual({
			url: "https://flag.convex.site",
			source: "--url",
		});
	});

	test("--url https://codepanel.ai, the site, signs in through its API", async () => {
		expect((await resolveUrl(login("https://codepanel.ai"), env)).url).toBe(HOSTED_API_URL);
		const { code, calls } = await run(true, { url: "https://codepanel.ai/" });
		expect(code).toBe(0);
		expect(calls[0]).toBe(`${HOSTED_API_URL}/api/v1/device/code`);
	});

	test("says which deployment, and what chose it", async () => {
		expect((await run(true)).out).toStartWith("Signing in to codepanel.ai.\n");
		await saveCredentials({ url: "https://saved.convex.site", token: TOKEN, savedAt: 1 }, env);
		const { out } = await run(true, { site: "https://review.example.com" });
		expect(out).toStartWith("Signing in to https://saved.convex.site (from your last login).");
	});

	test("a login with no flags signs in to codepanel.ai and saves it", async () => {
		const { code, calls } = await run(true);
		expect(code).toBe(0);
		expect(calls[0]).toBe(`${HOSTED_API_URL}/api/v1/device/code`);
		expect((await loadCredentials(env))?.url).toBe(HOSTED_API_URL);
	});
});

describe("a link the page could not resolve", () => {
	test("a deployment that sends a codepanel.ai link it does not serve stops before the browser", async () => {
		env.CODEPANEL_URL = "https://dev-deployment-1.convex.site";
		let failure = "";
		const result = await run(true).catch((error: Error) => {
			failure = error.message;
			return null;
		});
		expect(result).toBeNull();
		expect(failure).toContain("Stopped before opening the browser");
		expect(failure).toContain("https://dev-deployment-1.convex.site (from CODEPANEL_URL)");
		expect(failure).toContain(
			"codepanel login --url https://codepanel.ai, and unset CODEPANEL_URL",
		);
		expect(failure).toContain("set SITE_URL on that deployment");
		expect(await loadCredentials(env)).toBeNull();
	});

	test("a self-hosted deployment linking to its own site is fine", async () => {
		const { code, openedLinks } = await run(true, {
			url: "https://dev-deployment-1.convex.site",
			site: "https://review.example.com",
		});
		expect(code).toBe(0);
		expect(openedLinks).toEqual(["https://review.example.com/device?user_code=BCDF-GHJK"]);
	});

	test("linkMismatch looks only at codepanel.ai links from other deployments", () => {
		const code = (site: string) => ({
			deviceCode: "dc",
			userCode: "BCDF-GHJK",
			verificationUri: `${site}/device`,
			verificationUriComplete: `${site}/device?user_code=BCDF-GHJK`,
			expiresInSeconds: 600,
			intervalSeconds: 5,
		});
		const hosted = { url: HOSTED_API_URL, source: "default" } as const;
		const other = { url: "https://x.convex.site", source: "--url" } as const;
		expect(linkMismatch(code("https://codepanel.ai"), hosted)).toBeNull();
		expect(linkMismatch(code("https://review.example.com"), other)).toBeNull();
		expect(linkMismatch(code("https://codepanel.ai"), other)).toContain("(from --url)");
		expect(linkMismatch(code("not a url"), other)).toBeNull();
	});
});

test("Ctrl-C while waiting says the login was cancelled and exits 130", async () => {
	const controller = new AbortController();
	const warnings: string[] = [];
	const code = await runLogin(login(), {
		env,
		fetch: fakeDeployment([]),
		signal: controller.signal,
		sleep: async () => controller.abort(),
		say: () => {},
		warn: (line) => warnings.push(line),
		openBrowser: async () => false,
	});
	expect(code).toBe(130);
	expect(warnings).toEqual(["Login cancelled."]);
	expect(await loadCredentials(env)).toBeNull();
});

describe("after the code is approved", () => {
	test("a failed account lookup still counts: the token is saved", async () => {
		const { code, out } = await run(true, { meFails: true });
		expect(code).toBe(0);
		expect(out).toContain("Signed in (read, reviews:write). Saved to");
		expect(out).toContain("Could not look up the account just now");
		expect((await loadCredentials(env))?.token).toBe(TOKEN);
	});

	test("a login that cannot be saved says where and what to do, and fails", async () => {
		await writeFile(join(dir, "cfg"), "a file where the directory should be");
		const { code, warnings } = await run(true);
		expect(code).toBe(1);
		expect(warnings).toEqual([expect.stringContaining("the login could not be saved to")]);
		expect(warnings[0]).toContain("revoke the unused token");
	});

	test("Ctrl-C during the account lookup keeps the saved login and exits 130", async () => {
		const controller = new AbortController();
		const lookup = (async (input: RequestInfo | URL, init?: RequestInit) => {
			if (!String(input).endsWith("/me")) return fakeDeployment([])(input, init);
			controller.abort();
			throw new DOMException("aborted", "AbortError");
		}) as typeof fetch;
		const lines: string[] = [];
		const code = await runLogin(login(), {
			env,
			fetch: lookup,
			signal: controller.signal,
			sleep: async () => {},
			say: (line) => lines.push(line),
			warn: () => {},
			openBrowser: async () => false,
		});
		expect(code).toBe(130);
		expect(lines.join("\n")).toContain("Signed in (read, reviews:write). Saved to");
		expect((await loadCredentials(env))?.token).toBe(TOKEN);
	});

	test("warns when the shell's variables will win over the new login", async () => {
		env.CODEPANEL_TOKEN = TOKEN;
		env.CODEPANEL_URL = "https://other.convex.site";
		const { code, warnings } = await run(true, { url: "https://codepanel.ai" });
		expect(code).toBe(0);
		expect(warnings).toEqual([
			expect.stringContaining("CODEPANEL_TOKEN is set in this shell"),
			expect.stringContaining("CODEPANEL_URL is set to https://other.convex.site"),
		]);
	});

	test("no warning when the shell agrees with the login", async () => {
		env.CODEPANEL_URL = "https://codepanel.ai";
		expect((await run(true)).warnings).toEqual([]);
	});
});

describe("what login prints", () => {
	test("opens the browser and says so, with the code to compare", async () => {
		const { out, openedLinks } = await run(true);
		expect(openedLinks).toEqual([LINK]);
		expect(out).toContain("Your one-time code: BCDF-GHJK");
		expect(out).toContain(`Opened this link in your browser`);
		expect(out).toContain(`\n  ${LINK}\n`);
		expect(out).toContain("Check that the page shows the same code");
		expect(out).toContain("Signed in as octocat (read, reviews:write).");
		expect(out).not.toContain("\x1b[");
	});

	test("prints the link to open when no browser could be opened", async () => {
		const { out } = await run(false);
		expect(out).toContain(`Open this link in your browser:\n\n  ${LINK}`);
		expect(out).not.toContain("Opened");
	});

	test("sets the code in bold on a terminal, unless NO_COLOR", async () => {
		expect((await run(true, { isTTY: true })).out).toContain("\x1b[1mBCDF-GHJK\x1b[22m");
		env.NO_COLOR = "1";
		expect((await run(true, { isTTY: true })).out).not.toContain("\x1b[");
	});

	test("writes the instructions to stdout, not stderr", async () => {
		const out = spyOn(console, "log").mockImplementation(() => {});
		const err = spyOn(console, "error").mockImplementation(() => {});
		try {
			await runLogin(login(), {
				env,
				fetch: fakeDeployment([]),
				sleep: async () => {},
				isTTY: false,
				openBrowser: async () => true,
			});
			const printed = out.mock.calls.map((c) => String(c[0])).join("\n");
			expect(printed).toContain("Your one-time code: BCDF-GHJK");
			expect(printed).toContain("Signed in as octocat");
			expect(err).not.toHaveBeenCalled();
		} finally {
			out.mockRestore();
			err.mockRestore();
		}
	});
});
