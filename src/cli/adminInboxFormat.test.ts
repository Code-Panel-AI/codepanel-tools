import { describe, expect, test } from "bun:test";
import type { AdminHandled, AdminInbox } from "../lib/adminClient";
import { formatAdmin } from "./adminCommand";

const T = Date.parse("2026-10-18T12:00:00Z");

const inbox: AdminInbox = {
	status: "attention",
	problems: ["1 feedback message has gone unhandled for over 24 hours"],
	topic: null,
	unhandled: { count: 2, stale: 1, staleHours: 24, truncated: false },
	rows: [
		{
			id: "f1",
			topic: "bug",
			message: "line one\nline two",
			email: "a@example.com",
			userId: "u1",
			login: "octocat",
			createdAt: T,
			handledAt: null,
			handledReason: null,
		},
		{
			id: "f2",
			topic: "idea",
			message: "an idea",
			email: null,
			userId: null,
			login: null,
			createdAt: T - 3_600_000,
			handledAt: T,
			handledReason: "shipped",
		},
	],
	rowsTruncated: false,
};

describe("admin inbox", () => {
	test("never passes a visitor's control characters to the terminal", () => {
		const [row] = inbox.rows;
		if (!row) throw new Error("fixture");
		const hostile = {
			...inbox,
			rows: [{ ...row, message: "ok\u001b[2K\rfake: ok\nnext", email: "a@x\nInjected header" }],
		};
		const out = formatAdmin({ kind: "admin.inbox" }, hostile);
		expect(out).not.toContain("\u001b");
		expect(out).not.toContain("\r");
		expect(out).toContain("    ok\ufffd[2K\ufffdfake: ok");
		expect(out).toContain("    next");
		expect(out).toContain("<a@x Injected header>");
	});

	test("prints counts, then each message with its sender, keeping line breaks", () => {
		const out = formatAdmin({ kind: "admin.inbox" }, inbox);
		expect(out).toContain("inbox: attention");
		expect(out).toContain("Unhandled: 2, 1 for over 24 hours");
		expect(out).toContain("f1  bug  2026-10-18 12:00  octocat <a@example.com>");
		expect(out).toContain("      line one\n      line two");
		expect(out).toContain(
			"f2  idea  2026-10-18 11:00  signed out  [handled 2026-10-18 12:00: shipped]",
		);
		expect(out).toContain('codepanel admin handle <id> --reason "<why>"');
	});

	test("says so when there is nothing, and when the filter or caps cut the count", () => {
		const empty = {
			...inbox,
			rows: [],
			topic: "bug" as const,
			status: "ok" as const,
			problems: [],
		};
		const out = formatAdmin(
			{ kind: "admin.inbox", topic: "bug" },
			{
				...empty,
				unhandled: { count: 500, stale: 3, staleHours: 24, truncated: true },
			},
		);
		expect(out).toContain("Unhandled: 500+, 3+ for over 24 hours (listing bug only)");
		expect(out).toContain("No messages.");
		expect(out).not.toContain("Handle one");
	});

	test("a write prints its audit id and the command that reverses it", () => {
		const done: AdminHandled = {
			auditId: "a1",
			id: "f1",
			before: "unhandled",
			after: "handled",
			undoable: true,
			undo: { method: "POST", path: "/api/v1/admin/inbox/unhandle", body: {}, needs: ["reason"] },
		};
		const out = formatAdmin({ kind: "admin.handle", id: "f1", reason: "x", unhandle: false }, done);
		expect(out).toContain("Marked f1 handled.");
		expect(out).toContain("Audit id: a1");
		expect(out).toContain('Undo: codepanel admin unhandle f1 --reason "<why>"');
		const back = formatAdmin(
			{ kind: "admin.handle", id: "f1", reason: "x", unhandle: true },
			{ ...done, before: "handled", after: "unhandled" },
		);
		expect(back).toContain('Undo: codepanel admin handle f1 --reason "<why>"');
	});
});
