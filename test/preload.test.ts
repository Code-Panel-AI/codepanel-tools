import { expect, test } from "bun:test";
import childProcess, { execFileSync, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { configDir } from "../src/lib/credentials";
import { takeEscapes } from "./preload";

test("a real fetch to another host is refused and reported", async () => {
	await expect(fetch("https://codepanel.ai/device")).rejects.toThrow("Refused in tests");
	const [refused, ...rest] = takeEscapes();
	expect(refused).toStartWith("fetch(https://codepanel.ai) from ");
	expect(rest).toEqual([]);
});

test("a browser opener is refused; other commands still run", () => {
	expect(() => execFileSync("xdg-open", ["https://codepanel.ai"])).toThrow("Refused in tests");
	expect(() => Bun.spawn(["open", "https://codepanel.ai"])).toThrow("Refused in tests");
	expect(() => Bun.spawn({ cmd: ["xdg-open", "https://codepanel.ai"] })).toThrow(
		"Refused in tests",
	);
	expect(() => execSync("open https://codepanel.ai")).toThrow("Refused in tests");
	expect(() => childProcess.spawn("open", ["https://codepanel.ai"])).toThrow("Refused in tests");
	expect(takeEscapes()).toHaveLength(5);
	expect(execFileSync("echo", ["ok"], { encoding: "utf8" }).trim()).toBe("ok");
});

test("the developer's login is out of reach", () => {
	expect(process.env.NODE_ENV).toBe("test");
	expect(process.env.CODEPANEL_URL).toBeUndefined();
	expect(process.env.CODEPANEL_TOKEN).toBeUndefined();
	expect(configDir()).toStartWith(tmpdir());
});
