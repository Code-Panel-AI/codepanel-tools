/**
 * How a failed command is printed. With --json an agent parses stderr, so the
 * error keeps everything the server said (code, retryAfter, scope, reason)
 * instead of only its message.
 */
import { CodePanelError } from "../lib/client";

/** A failure as the text for stderr: the message, or with `json` one JSON line. */
export function errorText(error: unknown, json: boolean): string {
	const message = error instanceof Error ? error.message : String(error);
	if (!json) return message;
	const details = error instanceof CodePanelError ? { status: error.status, ...error.details } : {};
	return JSON.stringify({ error: { message, ...details } });
}
