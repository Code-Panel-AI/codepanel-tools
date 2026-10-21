import { expect, test } from "bun:test";
import { DEFAULT_WAIT_TIMEOUT_MS } from "../lib/wait";
import { waitOptions } from "./waitTools";

const MAX_WAIT_MS = 80_000;

test("a wait asks for its timeout, or the default", () => {
	expect(waitOptions(undefined, 30).timeoutMs).toBe(30_000);
	expect(waitOptions(undefined).timeoutMs).toBe(DEFAULT_WAIT_TIMEOUT_MS);
});

test("a host's limit holds whatever the call asks for", () => {
	const remote = { maxWaitMs: MAX_WAIT_MS };
	expect(waitOptions(remote).timeoutMs).toBe(MAX_WAIT_MS);
	expect(waitOptions(remote, 600).timeoutMs).toBe(MAX_WAIT_MS);
	expect(waitOptions(remote, 30).timeoutMs).toBe(30_000);
});
