/**
 * Open a link in the person's browser, the way `gh auth login` does. Returns
 * false when there is no browser to open (an SSH session, a Linux box with no
 * display) or the opener fails, so the caller prints the link instead.
 */
import { spawn } from "node:child_process";

type Env = Record<string, string | undefined>;

/**
 * An opener still running by now has handed off to the browser. Short, since
 * polling waits on it; the link is printed either way, so a late failure
 * still leaves the person a way in.
 */
const OPENER_GRACE_MS = 1000;
/** Values that mean CI is off, as some shells and tools export them. */
const CI_OFF = new Set(["", "0", "false"]);
/** What `bun test` sets NODE_ENV to. */
const TEST_ENV = "test";

/** The opener each platform ships, run without a shell so the URL is never parsed as a command. */
function opener(platform: NodeJS.Platform, url: string): [string, string[]] {
	if (platform === "darwin") return ["open", [url]];
	if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", url]];
	return ["xdg-open", [url]];
}

/** Whether a browser on this machine can be the one the person reads. */
export function canOpenBrowser(env: Env, platform: NodeJS.Platform): boolean {
	// Over SSH a browser would open on the remote machine, out of sight.
	if (env.SSH_CONNECTION || env.SSH_TTY) return false;
	if (!CI_OFF.has((env.CI ?? "").trim().toLowerCase())) return false;
	if (platform === "darwin" || platform === "win32") return true;
	return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

export type Spawn = typeof spawn;

/** Open `url` in the default browser; true if it was handed to one. Only http(s) links open. */
export function openBrowser(
	url: string,
	options: { env?: Env; platform?: NodeJS.Platform; spawn?: Spawn } = {},
): Promise<boolean> {
	const env = options.env ?? process.env;
	const platform = options.platform ?? process.platform;
	if (!/^https?:\/\//i.test(url) || !canOpenBrowser(env, platform)) return Promise.resolve(false);
	// Under `bun test` the real opener would hand every test's link to the
	// developer's browser, so only an injected spawn runs there.
	const run = options.spawn ?? (process.env.NODE_ENV === TEST_ENV ? null : spawn);
	if (!run) return Promise.resolve(false);
	const [command, args] = opener(platform, url);
	return new Promise((resolve) => {
		let child: ReturnType<Spawn>;
		try {
			child = run(command, args, { stdio: "ignore", detached: true });
		} catch {
			resolve(false);
			return;
		}
		const timer = setTimeout(() => resolve(true), OPENER_GRACE_MS);
		const settle = (opened: boolean) => {
			clearTimeout(timer);
			resolve(opened);
		};
		child.once("error", () => settle(false));
		child.once("exit", (code) => settle(code === 0));
		child.unref();
	});
}
