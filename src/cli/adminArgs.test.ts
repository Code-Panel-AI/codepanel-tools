import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";

const cmd = (line: string) => parseArgs(line.split(" ").filter(Boolean)).command;

describe("admin parsing", () => {
	test("overview is the default", () => {
		expect(cmd("admin")).toEqual({ kind: "admin.overview" });
		expect(cmd("admin overview")).toEqual({ kind: "admin.overview" });
		expect(() => cmd("admin overview extra")).toThrow("unexpected argument");
	});

	test("reports, audit and users", () => {
		expect(cmd("admin treasury")).toEqual({ kind: "admin.report", report: "treasury" });
		expect(cmd("admin reviews")).toEqual({ kind: "admin.report", report: "reviews" });
		expect(cmd("admin repos")).toEqual({ kind: "admin.report", report: "repos" });
		expect(cmd("admin quality")).toEqual({ kind: "admin.report", report: "quality" });
		expect(cmd("admin evals")).toEqual({ kind: "admin.report", report: "evals" });
		expect(cmd("admin audit --limit 5")).toEqual({ kind: "admin.audit", limit: 5 });
		expect(() => cmd("admin audit --limit 0")).toThrow("--limit");
		expect(cmd("admin users --cursor abc")).toEqual({ kind: "admin.users", cursor: "abc" });
		expect(cmd("admin user octocat")).toEqual({ kind: "admin.user", login: "octocat" });
		expect(() => cmd("admin user")).toThrow("GitHub login");
		expect(() => cmd("admin bogus")).toThrow("unknown admin command bogus");
	});

	test("inbox takes an optional topic, handle and unhandle a message id and a reason", () => {
		expect(cmd("admin inbox")).toEqual({ kind: "admin.inbox", topic: undefined });
		expect(cmd("admin inbox --topic bug")).toEqual({ kind: "admin.inbox", topic: "bug" });
		expect(() => cmd("admin inbox --topic nope")).toThrow("--topic must be one of");
		expect(cmd("admin handle f1 --reason replied")).toEqual({
			kind: "admin.handle",
			id: "f1",
			reason: "replied",
			unhandle: false,
		});
		expect(cmd("admin unhandle f1 --reason oops")).toMatchObject({ unhandle: true });
		expect(() => cmd("admin handle f1")).toThrow("--reason is required");
		expect(() => cmd("admin handle --reason x")).toThrow("feedback message id");
	});

	test("release takes one session id and needs a reason", () => {
		expect(cmd("admin release s123 --reason stuck")).toEqual({
			kind: "admin.release",
			sessionId: "s123",
			reason: "stuck",
		});
		expect(() => cmd("admin release s123")).toThrow("--reason is required");
		expect(() => cmd("admin release --reason stuck")).toThrow("session id");
		expect(() => cmd("admin release a b --reason stuck")).toThrow("unexpected argument");
	});

	test("comp and uncomp need a reason", () => {
		expect(cmd("admin comp octocat --reason why --until 2027-01-31")).toEqual({
			kind: "admin.comp",
			login: "octocat",
			until: "2027-01-31",
			reason: "why",
		});
		expect(() => cmd("admin comp octocat")).toThrow("--reason is required");
		expect(() => cmd("admin comp octocat --reason why --until 31-01-2027")).toThrow("--until");
		expect(() => cmd("admin comp octocat --reason why --until 2027-13-45")).toThrow("--until");
		expect(() => cmd("admin comp octocat --reason why --until 2027-02-31")).toThrow("--until");
		expect(cmd("admin uncomp octocat --reason why")).toEqual({
			kind: "admin.uncomp",
			login: "octocat",
			reason: "why",
		});
	});

	test("credit generates a request id unless given one", () => {
		const made = cmd("admin credit octocat 5.5 --reason why");
		expect(made).toMatchObject({ kind: "admin.credit", amountUsd: 5.5 });
		expect((made as { requestId: string }).requestId).toMatch(/^cli-/);
		expect(cmd("admin credit octocat -2 --reason why --request-id r1")).toMatchObject({
			amountUsd: -2,
			requestId: "r1",
		});
		expect(() => cmd("admin credit octocat lots --reason why")).toThrow("number of dollars");
		expect(() => cmd("admin credit octocat 0 --reason why")).toThrow("zero");
		expect(() => cmd("admin credit octocat --reason why")).toThrow("number of dollars");
	});

	test("budget takes an amount, none or default", () => {
		expect(cmd("admin budget a 40 --reason why")).toMatchObject({ monthlyBudgetUsd: 40 });
		expect(cmd("admin budget a none --reason why")).toMatchObject({ monthlyBudgetUsd: null });
		expect(cmd("admin budget a default --reason why")).toMatchObject({
			monthlyBudgetUsd: "default",
		});
		expect(() => cmd("admin budget a -1 --reason why")).toThrow("negative");
		expect(() => cmd("admin budget a 4 --reason")).toThrow("--reason needs a value");
	});

	test("undo and refresh-models", () => {
		expect(cmd("admin undo k17 --reason oops")).toEqual({
			kind: "admin.undo",
			auditId: "k17",
			reason: "oops",
		});
		expect(() => cmd("admin undo --reason oops")).toThrow("audit id");
		expect(cmd("admin refresh-models --reason stale")).toEqual({
			kind: "admin.refreshModels",
			reason: "stale",
		});
		expect(() => cmd("admin refresh-models")).toThrow("--reason is required");
	});

	test("alert-test needs a reason", () => {
		expect(cmd("admin alert-test --reason hook")).toEqual({
			kind: "admin.alertTest",
			reason: "hook",
		});
		expect(() => cmd("admin alert-test")).toThrow("--reason is required");
		expect(() => cmd("admin alert-test extra --reason hook")).toThrow();
	});

	test("rejects options the command does not take", () => {
		expect(() => cmd("admin system --limit 3")).toThrow("unknown option --limit");
	});

	test("balance records a provider's balance with a note", () => {
		expect(cmd("admin balance anthropic 120.5 --note console --as-of 2026-10-17")).toEqual({
			kind: "admin.balance",
			provider: "anthropic",
			amountUsd: 120.5,
			asOf: "2026-10-17",
			note: "console",
		});
		expect(() => cmd("admin balance anthropic 10")).toThrow("--note");
		expect(() => cmd("admin balance anthropic -1 --note x")).toThrow("negative");
	});
});
