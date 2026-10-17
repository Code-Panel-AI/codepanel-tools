/**
 * The CLI as a process: the first Ctrl-C ends whatever it is waiting on, with
 * exit code 130. The only server is a local one that never answers.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";

const CLI = new URL("./codepanel.ts", import.meta.url).pathname;
const TOKEN = `cpk_${"a".repeat(43)}`;
const SIGINT_EXIT_CODE = 130;
const SETTLE_MS = 500;
/** Far under any request or read the commands could be waiting on. */
const PROMPT_MS = 5000;

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Promise<Response>(() => undefined),
	});
});
afterAll(() => server.stop(true));

async function interrupted(args: string[], stdin: "ignore" | "pipe") {
	const proc = Bun.spawn(["bun", CLI, ...args], {
		env: {
			...process.env,
			CODEPANEL_URL: `http://127.0.0.1:${server.port}`,
			CODEPANEL_TOKEN: TOKEN,
		},
		stdin,
		stdout: "pipe",
		stderr: "pipe",
	});
	await Bun.sleep(SETTLE_MS);
	const started = Date.now();
	proc.kill("SIGINT");
	const code = await Promise.race([proc.exited, Bun.sleep(PROMPT_MS).then(() => "hung" as const)]);
	if (code === "hung") proc.kill("SIGKILL");
	return { code, ms: Date.now() - started };
}

test("Ctrl-C ends a request the server never answers", async () => {
	const { code, ms } = await interrupted(["whoami"], "ignore");
	expect(code).toBe(SIGINT_EXIT_CODE);
	expect(ms).toBeLessThan(PROMPT_MS);
});

test("Ctrl-C ends a read of stdin that stays open", async () => {
	const { code } = await interrupted(["handoff", "a/b#1", "--file", "-"], "pipe");
	expect(code).toBe(SIGINT_EXIT_CODE);
	const knowledge = await interrupted(["knowledge", "set", "a/b", "-"], "pipe");
	expect(knowledge.code).toBe(SIGINT_EXIT_CODE);
});
