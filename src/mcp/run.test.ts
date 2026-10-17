import { expect, test } from "bun:test";
import { type CodePanelClient, CodePanelError } from "../lib/client";
import type { ToolDef } from "./define";
import { runTool } from "./run";

const failing = (error: Error) =>
	({
		run: async () => {
			throw error;
		},
	}) as unknown as ToolDef;

test("a refusal's reason reaches the tool error beside its code", async () => {
	const refusal = new CodePanelError(400, "Buy CodePanel credits.", {
		code: "precondition",
		reason: "credits_required",
	});
	const result = await runTool(failing(refusal), {} as CodePanelClient, {});
	expect(result.isError).toBe(true);
	expect(JSON.parse(result.content[1]?.text ?? "{}")).toEqual({
		error: "Buy CodePanel credits.",
		code: "precondition",
		reason: "credits_required",
	});
});

test("a call's signal also cancels the requests its tool makes", async () => {
	const seen: Array<AbortSignal | undefined> = [];
	const client = {
		withSignal: (signal: AbortSignal) => ({ signal }),
	} as unknown as CodePanelClient;
	const def = {
		run: async (c: { signal?: AbortSignal }) => {
			seen.push(c.signal);
			return { ok: true };
		},
	} as unknown as ToolDef;
	const abort = new AbortController();
	await runTool(def, client, {}, { signal: abort.signal });
	expect(seen).toEqual([abort.signal]);
	// Without a signal (the remote endpoint) the client is used as it is.
	await runTool(def, client, {});
	expect(seen[1]).toBeUndefined();
});
