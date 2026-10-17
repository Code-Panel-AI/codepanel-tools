import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configFromEnv } from "./client";
import {
	clearCredentials,
	configDir,
	credentialsPath,
	loadCredentials,
	saveCredentials,
} from "./credentials";

const TOKEN = `cpk_${"a".repeat(43)}`;
const OTHER_TOKEN = `cpk_${"b".repeat(43)}`;
const URL_A = "https://a.convex.site";

let dir: string;
let env: Record<string, string>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "codepanel-creds-"));
	env = { CODEPANEL_CONFIG_DIR: join(dir, "cfg") };
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("credential file", () => {
	test("lives under the config directory", () => {
		expect(configDir({ XDG_CONFIG_HOME: "/x" })).toBe("/x/codepanel");
		expect(configDir({ CODEPANEL_CONFIG_DIR: "/y" })).toBe("/y");
		expect(credentialsPath({ CODEPANEL_CONFIG_DIR: "/y" })).toBe("/y/credentials.json");
	});

	test("is saved readable by its owner only, and round-trips", async () => {
		const saved = { url: URL_A, token: TOKEN, scopes: ["read"], savedAt: 1 };
		const path = await saveCredentials(saved, env);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect((await stat(configDir(env))).mode & 0o777).toBe(0o700);
		expect(await loadCredentials(env)).toEqual(saved);
		// No temporary file is left behind.
		expect(await readdir(configDir(env))).toEqual(["credentials.json"]);
	});

	test("a save that cannot be renamed into place leaves no temporary file", async () => {
		// A non-empty directory where the file should go makes the rename fail.
		await mkdir(join(credentialsPath(env), "blocker"), { recursive: true });
		await expect(saveCredentials({ url: URL_A, token: TOKEN, savedAt: 1 }, env)).rejects.toThrow();
		expect(await readdir(configDir(env))).toEqual(["credentials.json"]);
	});

	test("concurrent saves do not collide", async () => {
		await Promise.all([
			saveCredentials({ url: URL_A, token: TOKEN, savedAt: 1 }, env),
			saveCredentials({ url: URL_A, token: OTHER_TOKEN, savedAt: 2 }, env),
		]);
		expect([TOKEN, OTHER_TOKEN]).toContain((await loadCredentials(env))?.token ?? "");
		expect(await readdir(configDir(env))).toEqual(["credentials.json"]);
	});

	test("saving again replaces the file and keeps it private", async () => {
		await saveCredentials({ url: URL_A, token: TOKEN, savedAt: 1 }, env);
		await saveCredentials({ url: URL_A, token: OTHER_TOKEN, savedAt: 2 }, env);
		expect((await loadCredentials(env))?.token).toBe(OTHER_TOKEN);
		expect((await stat(credentialsPath(env))).mode & 0o777).toBe(0o600);
	});

	test("a missing or damaged file is no login", async () => {
		expect(await loadCredentials(env)).toBeNull();
		await saveCredentials({ url: URL_A, token: TOKEN, savedAt: 1 }, env);
		await writeFile(credentialsPath(env), "{not json");
		expect(await loadCredentials(env)).toBeNull();
		await writeFile(credentialsPath(env), JSON.stringify({ url: 1 }));
		expect(await loadCredentials(env)).toBeNull();
	});

	test("logout removes it and says whether there was one", async () => {
		expect(await clearCredentials(env)).toBe(false);
		await saveCredentials({ url: URL_A, token: TOKEN, savedAt: 1 }, env);
		expect(await clearCredentials(env)).toBe(true);
		expect(await loadCredentials(env)).toBeNull();
	});
});

describe("config from the environment and the saved login", () => {
	const stored = { url: URL_A, token: TOKEN, savedAt: 1 };

	test("a saved login is enough on its own", () => {
		expect(configFromEnv({}, stored)).toEqual({ url: URL_A, token: TOKEN });
	});

	test("the environment wins", () => {
		const config = configFromEnv(
			{ CODEPANEL_URL: "https://b.convex.site", CODEPANEL_TOKEN: OTHER_TOKEN },
			stored,
		);
		expect(config).toEqual({ url: "https://b.convex.site", token: OTHER_TOKEN });
		expect(configFromEnv({ CODEPANEL_TOKEN: OTHER_TOKEN }, stored)).toEqual({
			url: URL_A,
			token: OTHER_TOKEN,
		});
	});

	test("a saved token is never sent to a different deployment", () => {
		expect(() => configFromEnv({ CODEPANEL_URL: "https://b.convex.site" }, stored)).toThrow(
			"Not signed in",
		);
		// A trailing slash is the same deployment.
		expect(configFromEnv({ CODEPANEL_URL: `${URL_A}/` }, stored).token).toBe(TOKEN);
	});

	test("an expired saved login asks to log in again, unless the environment has a token", () => {
		const expired = { ...stored, expiresAt: 100 };
		expect(() => configFromEnv({}, expired, 200)).toThrow("expired");
		expect(configFromEnv({ CODEPANEL_TOKEN: OTHER_TOKEN }, expired, 200).token).toBe(OTHER_TOKEN);
	});

	test("with nothing at all, the error names both ways in", () => {
		expect(() => configFromEnv({}, null)).toThrow("codepanel login");
		expect(() => configFromEnv({}, null)).toThrow("CODEPANEL_TOKEN");
	});
});
