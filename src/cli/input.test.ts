import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { readSource, readStdin, readTextFile } from "./input";

test("readStdin collects the stream to its end", async () => {
	const stream = new PassThrough();
	const text = readStdin(undefined, stream);
	stream.write("# Rules\n");
	stream.end("- be kind\n");
	expect(await text).toBe("# Rules\n- be kind\n");
});

test("readStdin stops when the signal aborts, though the stream stays open", async () => {
	const stream = new PassThrough();
	const abort = new AbortController();
	const text = readStdin(abort.signal, stream).catch((e: unknown) => e);
	stream.write("partial");
	abort.abort();
	expect(((await text) as Error).name).toBe("AbortError");
	expect(stream.listenerCount("data")).toBe(0);
});

test("readStdin with a signal that is already aborted does not read", async () => {
	const abort = new AbortController();
	abort.abort();
	const error = await readStdin(abort.signal, new PassThrough()).catch((e: unknown) => e);
	expect((error as Error).name).toBe("AbortError");
});

test("a file that is missing is named, not an ENOENT dump", async () => {
	const path = join(tmpdir(), "codepanel-missing-file.md");
	const error = await readTextFile(path).catch((e: unknown) => e);
	expect((error as Error).message).toBe(`Could not read ${path}: no such file`);
	expect((error as Error).message).not.toContain("ENOENT");
});

test("a directory is named too", async () => {
	const dir = await mkdtemp(join(tmpdir(), "input-"));
	try {
		const error = await readSource(dir).catch((e: unknown) => e);
		expect((error as Error).message).toBe(`Could not read ${dir}: it is a directory`);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
