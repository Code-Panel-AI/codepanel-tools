import { describe, expect, test } from "bun:test";
import { CodePanelClient, CodePanelError, configFromEnv } from "./client";
import { apiUrlFor, HOSTED_API_URL } from "./clientConfig";

const TOKEN = `cpk_${"a".repeat(43)}`;

describe("configFromEnv", () => {
	test("requires both variables", () => {
		expect(() => configFromEnv({})).toThrow("CODEPANEL_URL");
		expect(() => configFromEnv({ CODEPANEL_URL: "https://x" })).toThrow("CODEPANEL_TOKEN");
	});

	test("turns away a webhook secret with an explanation", () => {
		expect(() =>
			configFromEnv({ CODEPANEL_URL: "https://x", CODEPANEL_TOKEN: crypto.randomUUID() }),
		).toThrow("Webhook secrets are no longer accepted");
	});

	test("accepts an API token", () => {
		expect(configFromEnv({ CODEPANEL_URL: "https://x/", CODEPANEL_TOKEN: TOKEN })).toEqual({
			url: "https://x",
			token: TOKEN,
		});
	});

	test("CODEPANEL_URL=https://codepanel.ai means the hosted API", () => {
		const config = configFromEnv({
			CODEPANEL_URL: "https://codepanel.ai/",
			CODEPANEL_TOKEN: TOKEN,
		});
		expect(config.url).toBe(HOSTED_API_URL);
	});
});

describe("apiUrlFor", () => {
	test("maps the site and a .convex.cloud URL to the API that serves /api/v1", () => {
		expect(apiUrlFor("https://codepanel.ai")).toBe(HOSTED_API_URL);
		expect(apiUrlFor(" https://www.codepanel.ai/ ")).toBe(HOSTED_API_URL);
		expect(apiUrlFor("https://happy-cat-1.convex.cloud")).toBe("https://happy-cat-1.convex.site");
		expect(apiUrlFor("https://happy-cat-1.convex.site//")).toBe("https://happy-cat-1.convex.site");
		expect(apiUrlFor("http://127.0.0.1:3211")).toBe("http://127.0.0.1:3211");
	});

	test("plain http only reaches this machine, since the token rides on every request", () => {
		expect(apiUrlFor("http://localhost:3211")).toBe("http://localhost:3211");
		expect(apiUrlFor("http://[::1]:3211")).toBe("http://[::1]:3211");
		expect(() => apiUrlFor("http://happy-cat-1.convex.site")).toThrow("unencrypted");
	});

	test("refuses what is not an http(s) URL", () => {
		expect(() => apiUrlFor("happy-cat-1.convex.site")).toThrow("is not a URL");
		expect(() => apiUrlFor("ftp://happy-cat-1.convex.site")).toThrow("not an http(s) URL");
	});
});

describe("requests", () => {
	function recording(status = 200, body: unknown = { ok: true }) {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImpl = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response(JSON.stringify(body), { status });
		}) as unknown as typeof fetch;
		return {
			calls,
			client: new CodePanelClient({ url: "https://x.site/", token: TOKEN, fetch: fetchImpl }),
		};
	}

	test("GET puts defined inputs in the query string and sends the token", async () => {
		const { calls, client } = recording(200, []);
		await client.listSessions({ repo: "a/b", status: undefined, limit: 5 });
		expect(calls[0]?.url).toBe("https://x.site/api/v1/sessions?repo=a%2Fb&limit=5");
		expect(calls[0]?.init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
	});

	test("a client that names its caller says so on every request", async () => {
		const calls: RequestInit[] = [];
		const fetchImpl = (async (_url: string, init: RequestInit) => {
			calls.push(init);
			return new Response("[]");
		}) as unknown as typeof fetch;
		let name: string | undefined;
		const caller = () => ({ client: name, pluginVersion: "0.3.0" });
		const client = new CodePanelClient({
			url: "https://x.site",
			token: TOKEN,
			fetch: fetchImpl,
			caller,
		});
		await client.listRepos();
		name = "claude-code";
		await client.listRepos();
		expect(calls[0]?.headers).toEqual({
			Authorization: `Bearer ${TOKEN}`,
			"X-CodePanel-Plugin-Version": "0.3.0",
		});
		expect(calls[1]?.headers).toMatchObject({ "X-CodePanel-Client": "claude-code" });
	});

	test("POST sends JSON, keeping null (clear) and dropping undefined (leave)", async () => {
		const { calls, client } = recording();
		await client.updatePanel({ panelId: "p1", name: undefined, budgetUsd: null });
		expect(calls[0]?.init.method).toBe("POST");
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ panelId: "p1", budgetUsd: null });
	});

	test("errors carry the server's status and message", async () => {
		const { client } = recording(403, { error: "this token lacks the read scope" });
		const failure = client.listRepos();
		expect(failure).rejects.toBeInstanceOf(CodePanelError);
		expect(failure).rejects.toThrow("this token lacks the read scope");
	});

	test("a non-JSON failure still produces a message", async () => {
		const fetchImpl = (async () =>
			new Response("oops", { status: 502 })) as unknown as typeof fetch;
		const client = new CodePanelClient({ url: "https://x", token: TOKEN, fetch: fetchImpl });
		expect(client.me()).rejects.toThrow("HTTP 502");
	});
});

describe("traceparent", () => {
	const TP = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
	const env = { CODEPANEL_URL: "https://x", CODEPANEL_TOKEN: TOKEN };

	test("$TRACEPARENT is taken when well formed and ignored otherwise", () => {
		expect(configFromEnv({ ...env, TRACEPARENT: TP }).traceparent).toBe(TP);
		expect(configFromEnv({ ...env, TRACEPARENT: "garbage" }).traceparent).toBeUndefined();
		for (const reserved of [
			TP.replace(/^00/, "ff"),
			`00-${"0".repeat(32)}-00f067aa0ba902b7-01`,
			`00-4bf92f3577b34da6a3ce929d0e0e4736-${"0".repeat(16)}-01`,
		]) {
			expect(configFromEnv({ ...env, TRACEPARENT: reserved }).traceparent).toBeUndefined();
		}
	});

	test("a trigger sends the client's traceparent unless the call gives its own", async () => {
		const bodies: unknown[] = [];
		const fetchImpl = (async (_url: string, init: RequestInit) => {
			bodies.push(JSON.parse(String(init.body)));
			return Response.json({ scheduled: true });
		}) as unknown as typeof fetch;
		const client = new CodePanelClient({
			url: "https://x",
			token: TOKEN,
			fetch: fetchImpl,
			traceparent: TP,
		});
		const own = TP.replace("-01", "-00");
		await client.triggerReview({ repo: "a/b", pr: 1 });
		await client.triggerReview({ repo: "a/b", pr: 1, traceparent: own });
		expect(bodies).toEqual([
			{ repo: "a/b", pr: 1, traceparent: TP },
			{ repo: "a/b", pr: 1, traceparent: own },
		]);
	});
});

describe("response bodies", () => {
	const clientFor = (respond: () => Response) =>
		new CodePanelClient({
			url: "https://x.site",
			token: TOKEN,
			fetch: (async () => respond()) as unknown as typeof fetch,
		});

	test("a 200 that is not JSON is an error naming the URL, not null", async () => {
		const client = clientFor(() => new Response("<html>hello</html>", { status: 200 }));
		const failure = client.me();
		expect(failure).rejects.toBeInstanceOf(CodePanelError);
		expect(failure).rejects.toThrow("Unexpected non-JSON response from https://x.site/api/v1/me");
		expect(failure).rejects.toThrow(".convex.site");
	});

	test("an empty success body is null, as a 204 sends", async () => {
		expect(await clientFor(() => new Response(null, { status: 204 })).me()).toBeNull();
		expect(await clientFor(() => new Response("", { status: 200 })).me()).toBeNull();
	});

	test("a failure's JSON body still gives its code and details", async () => {
		const client = clientFor(() =>
			Response.json({ error: "slow down", code: "rate_limited", retryAfter: 7 }, { status: 429 }),
		);
		const error = await client.me().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CodePanelError);
		expect((error as CodePanelError).status).toBe(429);
		expect((error as CodePanelError).details).toEqual({ code: "rate_limited", retryAfter: 7 });
	});
});

describe("cancelling requests", () => {
	/** A server that never answers; fetch rejects the way the real one does once aborted. */
	const hanging = (() => {
		const inits: RequestInit[] = [];
		const fetchImpl = ((_url: string, init: RequestInit) => {
			inits.push(init);
			return new Promise((_, reject) => {
				if (init.signal?.aborted) return reject(init.signal.reason);
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
			});
		}) as unknown as typeof fetch;
		return { inits, fetchImpl };
	})();
	const config = { url: "https://x", token: TOKEN, fetch: hanging.fetchImpl };

	test("aborting the signal ends a request that is in flight", async () => {
		const abort = new AbortController();
		const client = new CodePanelClient(config, abort.signal);
		const pending = client.me().catch((e: unknown) => e);
		abort.abort();
		const error = await pending;
		expect((error as Error).name).toBe("AbortError");
		expect(hanging.inits.at(-1)?.signal).toBe(abort.signal);
	});

	test("a signal that is already aborted fails the request at once", async () => {
		const abort = new AbortController();
		abort.abort();
		const error = await new CodePanelClient(config, abort.signal).me().catch((e: unknown) => e);
		expect((error as Error).name).toBe("AbortError");
	});

	test("without a signal no signal is sent", async () => {
		const client = new CodePanelClient({
			...config,
			fetch: (async (_url: string, init: RequestInit) => {
				expect("signal" in init).toBe(false);
				return Response.json({});
			}) as unknown as typeof fetch,
		});
		await client.me();
	});

	test("withSignal makes a copy that cancels with either signal", async () => {
		const own = new AbortController();
		const call = new AbortController();
		const base = new CodePanelClient(config, own.signal);
		const bound = base.withSignal(call.signal);
		const first = bound.me().catch((e: unknown) => e);
		call.abort();
		expect(((await first) as Error).name).toBe("AbortError");

		const second = base
			.withSignal(new AbortController().signal)
			.me()
			.catch((e: unknown) => e);
		own.abort();
		expect(((await second) as Error).name).toBe("AbortError");
	});
});
