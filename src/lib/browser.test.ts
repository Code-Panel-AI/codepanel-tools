import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { takeEscapes } from "../../test/preload";
import { canOpenBrowser, openBrowser, type Spawn } from "./browser";

const LINK = "https://codepanel.ai/device?user_code=BCDF-GHJK";

/** A spawn that records its call and ends the child the given way. */
function fakeSpawn(end: { exit?: number; error?: boolean; throws?: boolean }, calls: string[][]) {
	return ((command: string, args: string[]) => {
		calls.push([command, ...args]);
		if (end.throws) throw new Error("spawn failed");
		const child = Object.assign(new EventEmitter(), { unref: () => {} });
		queueMicrotask(() => {
			if (end.error) child.emit("error", new Error("ENOENT"));
			else child.emit("exit", end.exit ?? 0);
		});
		return child;
	}) as unknown as Spawn;
}

describe("canOpenBrowser", () => {
	test("a desktop can; SSH, CI and a Linux box with no display cannot", () => {
		expect(canOpenBrowser({}, "darwin")).toBe(true);
		expect(canOpenBrowser({}, "win32")).toBe(true);
		expect(canOpenBrowser({ DISPLAY: ":0" }, "linux")).toBe(true);
		expect(canOpenBrowser({ WAYLAND_DISPLAY: "wayland-0" }, "linux")).toBe(true);
		expect(canOpenBrowser({}, "linux")).toBe(false);
		expect(canOpenBrowser({ SSH_CONNECTION: "1.2.3.4 5 6.7.8.9 22" }, "darwin")).toBe(false);
		expect(canOpenBrowser({ SSH_TTY: "/dev/ttys001" }, "darwin")).toBe(false);
		expect(canOpenBrowser({ CI: "true" }, "darwin")).toBe(false);
		expect(canOpenBrowser({ CI: "1" }, "darwin")).toBe(false);
		expect(canOpenBrowser({ CI: "false" }, "darwin")).toBe(true);
		expect(canOpenBrowser({ CI: "0" }, "darwin")).toBe(true);
	});
});

describe("openBrowser", () => {
	test("runs the platform's opener with the link as one argument", async () => {
		const calls: string[][] = [];
		const spawn = fakeSpawn({ exit: 0 }, calls);
		expect(await openBrowser(LINK, { env: {}, platform: "darwin", spawn })).toBe(true);
		expect(await openBrowser(LINK, { env: { DISPLAY: ":0" }, platform: "linux", spawn })).toBe(
			true,
		);
		expect(await openBrowser(LINK, { env: {}, platform: "win32", spawn })).toBe(true);
		expect(calls).toEqual([
			["open", LINK],
			["xdg-open", LINK],
			["rundll32", "url.dll,FileProtocolHandler", LINK],
		]);
	});

	test("falls back when the opener fails, is missing or there is no browser", async () => {
		const calls: string[][] = [];
		const env = {};
		const darwin = "darwin" as const;
		const failing = fakeSpawn({ exit: 1 }, calls);
		expect(await openBrowser(LINK, { env, platform: darwin, spawn: failing })).toBe(false);
		const missing = fakeSpawn({ error: true }, calls);
		expect(await openBrowser(LINK, { env, platform: darwin, spawn: missing })).toBe(false);
		const throwing = fakeSpawn({ throws: true }, calls);
		expect(await openBrowser(LINK, { env, platform: darwin, spawn: throwing })).toBe(false);
		const ssh = { SSH_TTY: "/dev/ttys001" };
		expect(await openBrowser(LINK, { env: ssh, platform: darwin, spawn: failing })).toBe(false);
		expect(calls).toHaveLength(3);
	});

	test("never runs the real opener under the test runner", async () => {
		// test/preload.ts sets NODE_ENV and stands in for node:child_process.
		expect(process.env.NODE_ENV).toBe("test");
		expect(await openBrowser(LINK, { env: {}, platform: "darwin" })).toBe(false);
		expect(takeEscapes()).toEqual([]);
	});

	test("the preload stops the real opener even when NODE_ENV is not test", async () => {
		// As when a shell exports NODE_ENV=development, which bun test keeps.
		process.env.NODE_ENV = "development";
		try {
			expect(await openBrowser(LINK, { env: {}, platform: "darwin" })).toBe(false);
		} finally {
			process.env.NODE_ENV = "test";
		}
		const [refused, ...rest] = takeEscapes();
		expect(refused).toStartWith(`spawn(open ${LINK}) from `);
		expect(rest).toEqual([]);
	});

	test("opens only http(s) links", async () => {
		const calls: string[][] = [];
		const spawn = fakeSpawn({ exit: 0 }, calls);
		const options = { env: {}, platform: "darwin" as const, spawn };
		expect(await openBrowser("file:///etc/passwd", options)).toBe(false);
		expect(await openBrowser("javascript:alert(1)", options)).toBe(false);
		expect(calls).toHaveLength(0);
	});
});
