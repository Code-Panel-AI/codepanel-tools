/**
 * Loaded before every test file (bunfig.toml). Keeps a test run on the
 * developer's machine from reaching anything outside it:
 *
 * - no browser opens: `open`, `xdg-open` and the like are refused, and a test
 *   that tries one fails, even where the code under test swallows the error;
 * - no real network: global fetch is refused unless a test stubs it;
 * - no real login: CODEPANEL_* come out of the environment and the config
 *   directory is a fresh temp dir, so a default `process.env` never finds the
 *   developer's saved credentials, let alone deletes them.
 *
 * Tests inject fetch, env, sleep and the opener; this is the backstop.
 */
import { afterAll, afterEach, mock } from "bun:test";
import * as childProcess from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { sharedAbsenceMemory } from "../src/lib/waitMessages";

/** Commands that hand a link to the desktop's browser. */
const OPENERS = new Set([
	"open",
	"xdg-open",
	"rundll32",
	"start",
	"explorer",
	"wslview",
	"sensible-browser",
	"x-www-browser",
	"gio",
]);
/** Hosts a test may fetch for real: servers it started itself. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ENV_TO_CLEAR = ["CODEPANEL_URL", "CODEPANEL_TOKEN", "CODEPANEL_AGENT", "TRACEPARENT"];

const escapes: string[] = [];

/** What tests tried to reach outside the machine since the last call, cleared. */
export function takeEscapes(): string[] {
	return escapes.splice(0);
}

/**
 * The first frame outside this file and node_modules. Work a test scheduled
 * can run during a later test, so the test that fails may not be the culprit.
 */
function caller(): string {
	const frames = (new Error().stack ?? "").split("\n").slice(1);
	const frame = frames.find((f) => !f.includes(import.meta.path) && !f.includes("node_modules"));
	return frame?.trim().replace(/^at /, "") ?? "unknown";
}

function refuse(what: string): never {
	const call = `${what} from ${caller()}`;
	escapes.push(call);
	throw new Error(`Refused in tests: ${call}. Inject a fake instead.`);
}

/**
 * The program a call runs: Bun.spawn's argv[0] (or its `{ cmd }` form's),
 * spawn's file, or exec's first word. An opener behind `sh -c` or `env` is
 * not caught; the fetch and env guards still hold there.
 */
function commandOf(file: unknown): string {
	const argv = typeof file === "object" && file !== null && "cmd" in file ? file.cmd : file;
	const first = Array.isArray(argv) ? argv[0] : argv;
	return basename(
		String(first ?? "")
			.trim()
			.split(/\s+/)[0] ?? "",
	);
}

function guard<F extends (...args: never[]) => unknown>(name: string, real: F): F {
	return ((...args: Parameters<F>) => {
		const [file, rest] = args as unknown[];
		if (OPENERS.has(commandOf(file))) {
			refuse(`${name}(${commandOf(file)} ${Array.isArray(rest) ? rest.join(" ") : ""})`);
		}
		return real(...args);
	}) as F;
}

// bun test sets NODE_ENV only when the shell has not; code that checks for
// the test runner must see it either way.
process.env.NODE_ENV = "test";
for (const name of ENV_TO_CLEAR) delete process.env[name];
const configHome = mkdtempSync(join(tmpdir(), "codepanel-test-config-"));
process.env.CODEPANEL_CONFIG_DIR = join(configHome, "codepanel");
process.env.XDG_CONFIG_HOME = configHome;

process.on("exit", () => rmSync(configHome, { recursive: true, force: true }));

const guarded = {
	...childProcess,
	spawn: guard("spawn", childProcess.spawn),
	spawnSync: guard("spawnSync", childProcess.spawnSync),
	exec: guard("exec", childProcess.exec),
	execSync: guard("execSync", childProcess.execSync),
	execFile: guard("execFile", childProcess.execFile),
	execFileSync: guard("execFileSync", childProcess.execFileSync),
};
// The default export too, for `import cp from "node:child_process"`.
mock.module("node:child_process", () => ({ ...guarded, default: guarded }));
Bun.spawn = guard("Bun.spawn", Bun.spawn);
Bun.spawnSync = guard("Bun.spawnSync", Bun.spawnSync);

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (!LOCAL_HOSTS.has(url.hostname)) refuse(`fetch(${url.origin})`);
		return realFetch(input, init);
	},
	{ preconnect: realFetch.preconnect },
) as typeof fetch;

function failOnEscapes(): void {
	const found = takeEscapes();
	if (found.length > 0) {
		throw new Error(`This test reached outside the machine: ${found.join(", ")}`);
	}
}

afterEach(failOnEscapes);
// A wait's memory of an absent review is process-wide; no test inherits another's.
afterEach(() => sharedAbsenceMemory.clear());
// Work scheduled by a file's last test can run after its last afterEach.
afterAll(failOnEscapes);
