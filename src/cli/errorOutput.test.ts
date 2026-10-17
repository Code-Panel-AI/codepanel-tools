import { expect, test } from "bun:test";
import { CodePanelError } from "../lib/client";
import { errorText } from "./errorOutput";

test("without --json an error is its message", () => {
	const error = new CodePanelError(429, "Slow down.", { code: "rate_limited", retryAfter: 7 });
	expect(errorText(error, false)).toBe("Slow down.");
	expect(errorText("plain", false)).toBe("plain");
});

test("with --json a server error keeps its status, code and details", () => {
	const error = new CodePanelError(400, "Start a CodePanel plan.", {
		code: "precondition",
		reason: "plan_required",
	});
	expect(JSON.parse(errorText(error, true))).toEqual({
		error: {
			message: "Start a CodePanel plan.",
			status: 400,
			code: "precondition",
			reason: "plan_required",
		},
	});
	const limited = new CodePanelError(429, "Slow down.", { code: "rate_limited", retryAfter: 7 });
	expect(JSON.parse(errorText(limited, true)).error).toMatchObject({ retryAfter: 7, status: 429 });
});

test("with --json any other error is still one parseable line", () => {
	const text = errorText(new Error("Not signed in."), true);
	expect(text).not.toContain("\n");
	expect(JSON.parse(text)).toEqual({ error: { message: "Not signed in." } });
});
