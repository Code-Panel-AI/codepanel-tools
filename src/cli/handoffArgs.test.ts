import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "./args";
import { type HandoffCommand, handoffText } from "./handoffArgs";

const cmd = (argv: string[]) => parseArgs(argv).command;

test("handoff takes the note from --text or --file, with an optional sha and agent", () => {
	expect(cmd(["handoff", "acme/app#7", "--text", "Tested 503.", "--agent", "codex"])).toEqual({
		kind: "handoff",
		repo: "acme/app",
		pr: 7,
		text: "Tested 503.",
		file: undefined,
		sha: undefined,
		agent: "codex",
		authorAgent: undefined,
		authorModel: undefined,
	});
	expect(cmd(["handoff", "acme/app", "7", "--file", "-", "--sha", "abc1234"])).toMatchObject({
		file: "-",
		sha: "abc1234",
	});
});

test("handoff needs exactly one source and a real sha", () => {
	expect(() => cmd(["handoff", "acme/app#7"])).toThrow("exactly one of --text or --file");
	expect(() => cmd(["handoff", "acme/app#7", "--text", "a", "--file", "b"])).toThrow(
		"exactly one of --text or --file",
	);
	expect(() => cmd(["handoff", "acme/app#7", "--text", "a", "--sha", "main"])).toThrow("--sha");
	expect(() => cmd(["handoff", "acme/app#7", "extra", "--text", "a"])).toThrow("--text or --file");
});

test("handoffText reads the file it is given", async () => {
	const dir = await mkdtemp(join(tmpdir(), "handoff-"));
	try {
		const path = join(dir, "handoff.md");
		await writeFile(path, "Left out: the migration.");
		const command: HandoffCommand = { kind: "handoff", repo: "a/b", pr: 1, file: path };
		expect(await handoffText(command)).toBe("Left out: the migration.");
		expect(await handoffText({ ...command, file: undefined, text: "inline" })).toBe("inline");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("handoffText names a missing file instead of printing ENOENT", async () => {
	const path = join(tmpdir(), "codepanel-no-such-handoff.txt");
	const command: HandoffCommand = { kind: "handoff", repo: "a/b", pr: 1, file: path };
	expect(handoffText(command)).rejects.toThrow(`Could not read ${path}: no such file`);
});

test("handoffText stops reading stdin when the signal aborts", async () => {
	const abort = new AbortController();
	const command: HandoffCommand = { kind: "handoff", repo: "a/b", pr: 1, file: "-" };
	abort.abort();
	const error = await handoffText(command, abort.signal).catch((e: unknown) => e);
	expect((error as Error).name).toBe("AbortError");
});

test("explicit code author flags need a full head SHA and stay distinct from the submitter", () => {
	const sha = "a".repeat(40);
	expect(
		cmd([
			"handoff",
			"acme/app#7",
			"--text",
			"tested",
			"--sha",
			sha,
			"--agent",
			"review-bot",
			"--author-agent",
			"Claude Code",
			"--author-model",
			"Claude Opus 5.5",
		]),
	).toMatchObject({
		sha,
		agent: "review-bot",
		authorAgent: "Claude Code",
		authorModel: "Claude Opus 5.5",
	});
	expect(() =>
		cmd(["handoff", "acme/app#7", "--text", "tested", "--author-agent", "Claude Code"]),
	).toThrow("full 40-character");
});
