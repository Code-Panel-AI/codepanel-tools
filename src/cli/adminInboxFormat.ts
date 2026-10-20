/** `codepanel admin inbox`, `handle` and `unhandle`, printed as text; --json prints the whole response. */
import type { AdminHandled, AdminInbox } from "../lib/adminClient";

const DATE_TIME_CHARS = 16;
/** Messages printed; the API returns more and --json prints them all. */
const LISTED = 20;

/**
 * Feedback comes from anyone, so control characters (an ANSI escape could hide
 * text or fake a header line) are shown as U+FFFD before reaching a terminal.
 * Line breaks survive in a message body and nowhere else.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;
const LINE_BREAK = /\r?\n/;
const clean = (text: string) => text.replace(CONTROL, "\ufffd");
const oneLine = (text: string) => clean(text.replace(/\r?\n/g, " "));

const when = (ms: number) => new Date(ms).toISOString().slice(0, DATE_TIME_CHARS).replace("T", " ");
type Row = AdminInbox["rows"][number];

function header(r: Row): string {
	const from = r.login ?? "signed out";
	const email = r.email ? ` <${oneLine(r.email)}>` : "";
	const state =
		r.handledAt === null
			? ""
			: `  [handled ${when(r.handledAt)}: ${oneLine(r.handledReason ?? "")}]`;
	return `${r.id}  ${r.topic}  ${when(r.createdAt)}  ${from}${email}${state}`;
}

/** The message, indented under its header, so line breaks survive. */
function body(r: Row): string[] {
	return r.message.split(LINE_BREAK).map((line) => `    ${clean(line)}`);
}

export function formatInbox(i: AdminInbox): string {
	const u = i.unhandled;
	const plus = u.truncated ? "+" : "";
	const filter = i.topic === null ? "" : ` (listing ${i.topic} only)`;
	const shown = i.rows.slice(0, LISTED);
	const more =
		i.rows.length > shown.length || i.rowsTruncated
			? [`  ...more messages than listed (--json)`]
			: [];
	return [
		`inbox: ${i.status}`,
		...i.problems.map((p) => `  ${p}`),
		`Unhandled: ${u.count}${plus}, ${u.stale}${plus} for over ${u.staleHours} hours${filter}`,
		...(shown.length === 0
			? ["No messages."]
			: shown.flatMap((r) => [header(r), ...body(r)]).map((line) => `  ${line}`)),
		...more,
		...(shown.some((r) => r.handledAt === null)
			? ['Handle one: codepanel admin handle <id> --reason "<why>"']
			: []),
		"Add --json for the full report.",
	].join("\n");
}

export function formatHandled(h: AdminHandled): string {
	const reverse = h.after === "handled" ? "unhandle" : "handle";
	return [
		`Marked ${h.id} ${h.after}.`,
		`Audit id: ${h.auditId}`,
		`before: ${h.before}`,
		`after: ${h.after}`,
		`Undo: codepanel admin ${reverse} ${h.id} --reason "<why>"`,
	].join("\n");
}
