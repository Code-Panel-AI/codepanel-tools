import { describe, expect, test } from "bun:test";
import { type LoginOptions, login } from "./deviceLogin";

const URL = "https://deployment.test";
const CODE = {
	device_code: "dc",
	user_code: "BCDF-GHJK",
	verification_uri: "https://site.test/device",
	verification_uri_complete: "https://site.test/device?user_code=BCDF-GHJK",
	expires_in: 600,
	interval: 5,
};
const TOKEN = { access_token: "cpk_x", scope: "read", expires_in: 60 };

type Reply = Response | Error;
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** A fetch that answers /code with `code` and each /token poll with the next reply. */
function scripted(code: Reply, polls: Reply[], seen: RequestInit[] = []): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		seen.push(init ?? {});
		const reply = String(input).endsWith("/code") ? code : (polls.shift() ?? new Error("done"));
		if (reply instanceof Error) throw reply;
		return reply;
	}) as typeof fetch;
}

function options(fetchImpl: typeof fetch, extra: Partial<LoginOptions> = {}): LoginOptions {
	return {
		url: URL,
		clientName: "t",
		fetch: fetchImpl,
		sleep: async () => {},
		onCode: () => {},
		...extra,
	};
}

describe("device login", () => {
	test("rides out a proxy's 502 and an HTML page while polling", async () => {
		const polls = [new Response("bad gateway", { status: 502 }), json({}, 503), json(TOKEN)];
		const result = await login(options(scripted(json(CODE), polls)));
		expect(result).toMatchObject({ status: "approved", token: "cpk_x" });
	});

	test("gives up after five failed polls in a row, naming the deployment", async () => {
		const polls = Array.from({ length: 6 }, () => new Response("<html>", { status: 502 }));
		await expect(login(options(scripted(json(CODE), polls)))).rejects.toThrow(
			`${URL} kept answering HTTP 502`,
		);
	});

	test("an error it does not know ends the login at once", async () => {
		const polls = [json({ error: "server_error", error_description: "Broken." }, 400), json(TOKEN)];
		await expect(login(options(scripted(json(CODE), polls)))).rejects.toThrow("Broken.");
	});

	test("a 429 without a body slows down", async () => {
		const slept: number[] = [];
		const polls = [
			new Response(null, { status: 429, headers: { "retry-after": "30" } }),
			json(TOKEN),
		];
		const sleep = async (ms: number) => void slept.push(ms);
		await login(options(scripted(json(CODE), polls), { sleep }));
		expect(slept).toEqual([5000, 30_000]);
	});

	test("a server that leaves out the interval is polled every five seconds, not in a loop", async () => {
		const slept: number[] = [];
		const { interval: _, verification_uri_complete: __, ...bare } = CODE;
		const shown: string[] = [];
		await login(
			options(scripted(json(bare), [json(TOKEN)]), {
				sleep: async (ms) => void slept.push(ms),
				onCode: (c) => void shown.push(c.verificationUriComplete),
			}),
		);
		expect(slept).toEqual([5000]);
		expect(shown).toEqual(["https://site.test/device?user_code=BCDF-GHJK"]);
	});

	test("stops at the code's expiry even when the server never says so", async () => {
		let clock = 0;
		const pending = () => json({ error: "authorization_pending" }, 400);
		const polls = Array.from({ length: 1000 }, pending);
		const result = await login(
			options(scripted(json(CODE), polls), {
				now: () => clock,
				sleep: async (ms) => {
					clock += ms;
				},
			}),
		);
		expect(result).toEqual({ status: "expired" });
		expect(polls.length).toBeGreaterThan(800);
	});

	test("never sleeps past the code's expiry, however long the interval", async () => {
		let clock = 0;
		const slept: number[] = [];
		const result = await login(
			options(scripted(json({ ...CODE, expires_in: 10, interval: 600 }), []), {
				now: () => clock,
				sleep: async (ms) => {
					slept.push(ms);
					clock += ms;
				},
			}),
		);
		expect(result).toEqual({ status: "expired" });
		expect(slept).toEqual([10_000]);
	});

	test("something that is not a deployment gets a pointer to the right URL", async () => {
		const page = new Response("<!doctype html>", { status: 404 });
		await expect(login(options(scripted(page, [])))).rejects.toThrow(
			`${URL} did not answer as a CodePanel deployment (HTTP 404)`,
		);
	});

	test("a network failure names the deployment it could not reach", async () => {
		const down = new TypeError("Unable to connect");
		await expect(login(options(scripted(down, [])))).rejects.toThrow(
			`Could not reach ${URL}: Unable to connect`,
		);
	});

	test("Ctrl-C during a request ends the login as aborted, and reaches the request", async () => {
		const controller = new AbortController();
		const seen: RequestInit[] = [];
		const hanging = (async (_: RequestInfo | URL, init?: RequestInit) => {
			seen.push(init ?? {});
			controller.abort();
			throw new DOMException("aborted", "AbortError");
		}) as unknown as typeof fetch;
		const result = await login(options(hanging, { signal: controller.signal }));
		expect(result).toEqual({ status: "aborted" });
		expect(seen[0]?.signal).toBe(controller.signal);
	});
});
