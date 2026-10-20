import { describe, expect, test } from "bun:test";
import { AdminClient, adminConfigFromEnv } from "./adminClient";

const TOKEN = `cpk_${"a".repeat(43)}`;
const ADMIN = `cpk_${"b".repeat(43)}`;
const URL_ENV = { CODEPANEL_URL: "https://x.convex.site" };

describe("adminConfigFromEnv", () => {
	test("CODEPANEL_ADMIN_TOKEN wins over CODEPANEL_TOKEN", () => {
		const config = adminConfigFromEnv({
			...URL_ENV,
			CODEPANEL_TOKEN: TOKEN,
			CODEPANEL_ADMIN_TOKEN: ADMIN,
		});
		expect(config.token).toBe(ADMIN);
		expect(config.url).toBe("https://x.convex.site");
	});

	test("falls back to the ordinary token", () => {
		expect(adminConfigFromEnv({ ...URL_ENV, CODEPANEL_TOKEN: TOKEN }).token).toBe(TOKEN);
	});

	test("the admin token alone is enough, and must look like a token", () => {
		expect(adminConfigFromEnv({ ...URL_ENV, CODEPANEL_ADMIN_TOKEN: ADMIN }).token).toBe(ADMIN);
		expect(() => adminConfigFromEnv({ ...URL_ENV, CODEPANEL_ADMIN_TOKEN: "nope" })).toThrow(
			"CODEPANEL_ADMIN_TOKEN",
		);
	});
});

describe("AdminClient", () => {
	function fake(body: unknown, status = 200) {
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response(JSON.stringify(body), { status });
		}) as unknown as typeof fetch;
		return { calls, fetchImpl };
	}

	test("sends the admin token to /api/v1/admin and posts JSON", async () => {
		const { calls, fetchImpl } = fake({ auditId: "k1", applied: true });
		const config = adminConfigFromEnv({
			...URL_ENV,
			CODEPANEL_TOKEN: TOKEN,
			CODEPANEL_ADMIN_TOKEN: ADMIN,
		});
		const admin = AdminClient.fromConfig({ ...config, fetch: fetchImpl });
		await admin.credits({ login: "a", amountUsd: 5, requestId: "r1", reason: "why" });
		const call = calls[0];
		expect(call?.url).toBe("https://x.convex.site/api/v1/admin/users/credits");
		expect(call?.init.headers).toMatchObject({ Authorization: `Bearer ${ADMIN}` });
		expect(JSON.parse(String(call?.init.body))).toEqual({
			login: "a",
			amountUsd: 5,
			requestId: "r1",
			reason: "why",
		});
	});

	test("reads put their input in the query string, and errors keep the server message", async () => {
		const ok = fake({ entries: [] });
		await AdminClient.fromConfig({ url: "https://x", token: ADMIN, fetch: ok.fetchImpl }).audit(5);
		expect(ok.calls[0]?.url).toBe("https://x/api/v1/admin/audit?limit=5");
		const denied = fake({ error: "Missing scope", code: "missing_scope" }, 403);
		const admin = AdminClient.fromConfig({
			url: "https://x",
			token: TOKEN,
			fetch: denied.fetchImpl,
		});
		await expect(admin.overview()).rejects.toThrow("Missing scope");
	});

	test("each method calls its route with its input", async () => {
		const cases: [string, (a: AdminClient) => Promise<unknown>, string, unknown][] = [
			["GET /admin/overview", (a) => a.overview(), "/admin/overview", undefined],
			["GET /admin/users", (a) => a.users("c1"), "/admin/users?cursor=c1", undefined],
			["GET /admin/users/get", (a) => a.user("oct"), "/admin/users/get?login=oct", undefined],
			[
				"POST /admin/users/comp",
				(a) => a.comp({ login: "oct", until: "2027-01-31", reason: "r" }),
				"/admin/users/comp",
				{ login: "oct", until: "2027-01-31", reason: "r" },
			],
			[
				"POST /admin/users/comp/revoke",
				(a) => a.revokeComp({ login: "oct", reason: "r" }),
				"/admin/users/comp/revoke",
				{ login: "oct", reason: "r" },
			],
			[
				"POST /admin/users/budget",
				(a) => a.budget({ login: "oct", monthlyBudgetUsd: null, reason: "r" }),
				"/admin/users/budget",
				{ login: "oct", monthlyBudgetUsd: null, reason: "r" },
			],
			[
				"POST /admin/audit/undo",
				(a) => a.undo({ auditId: "k1", reason: "r" }),
				"/admin/audit/undo",
				{ auditId: "k1", reason: "r" },
			],
			[
				"POST /admin/models/refresh",
				(a) => a.refreshModels("r"),
				"/admin/models/refresh",
				{ reason: "r" },
			],
			["GET /admin/quality", (a) => a.quality(), "/admin/quality", undefined],
			["GET /admin/evals", (a) => a.evals(), "/admin/evals", undefined],
			[
				"POST /admin/inbox/handle",
				(a) => a.handle({ id: "f1", reason: "r", unhandle: false }),
				"/admin/inbox/handle",
				{ id: "f1", reason: "r" },
			],
			[
				"POST /admin/inbox/unhandle",
				(a) => a.handle({ id: "f1", reason: "r", unhandle: true }),
				"/admin/inbox/unhandle",
				{ id: "f1", reason: "r" },
			],
			[
				"POST /admin/treasury/balances",
				(a) => a.recordBalance({ provider: "openai", amountUsd: 9, note: "n" }),
				"/admin/treasury/balances",
				{ provider: "openai", amountUsd: 9, note: "n" },
			],
		];
		for (const [name, call, path, body] of cases) {
			const { calls, fetchImpl } = fake({});
			await call(AdminClient.fromConfig({ url: "https://x", token: ADMIN, fetch: fetchImpl }));
			const sent = calls[0];
			expect(`${sent?.init.method} ${sent?.url}`).toBe(
				`${name.split(" ")[0]} https://x/api/v1${path}`,
			);
			expect(
				sent?.init.body === undefined ? undefined : JSON.parse(String(sent.init.body)),
			).toEqual(body);
		}
	});
});
