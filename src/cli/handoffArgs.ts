/**
 * `codepanel handoff owner/name#123 --file handoff.md` (or `--text "…"`, or
 * `--file -` for stdin): the author agent's note for its pull request's next
 * review round. See convex/lib/handoff.ts.
 */
import { readSource } from "./input";
import { UsageError } from "./usageError";

export interface HandoffCommand {
	kind: "handoff";
	repo: string;
	pr: number;
	/** Exactly one of text and file; file "-" is stdin. */
	text?: string;
	file?: string;
	sha?: string;
	agent?: string;
	authorAgent?: string;
	authorModel?: string;
}

interface FlagReader {
	flag(name: string): string | undefined;
}

export function parseHandoff(
	repo: string,
	pr: number,
	positionals: string[],
	r: FlagReader,
): HandoffCommand {
	if (positionals.some(Boolean)) throw new UsageError("give the handoff with --text or --file");
	const text = r.flag("text");
	const file = r.flag("file");
	if ((text === undefined) === (file === undefined)) {
		throw new UsageError("give the handoff with exactly one of --text or --file (- for stdin)");
	}
	const sha = r.flag("sha");
	if (sha !== undefined && !/^[0-9a-f]{7,40}$/i.test(sha)) {
		throw new UsageError("--sha must be a commit sha (7 to 40 hex characters)");
	}
	const authorAgent = r.flag("author-agent");
	const authorModel = r.flag("author-model");
	if (
		(authorAgent !== undefined || authorModel !== undefined) &&
		!/^[0-9a-f]{40}$/i.test(sha ?? "")
	) {
		throw new UsageError(
			"--author-agent/--author-model require --sha with the full 40-character head commit",
		);
	}
	return {
		kind: "handoff",
		repo,
		pr,
		text,
		file,
		sha,
		agent: r.flag("agent"),
		authorAgent,
		authorModel,
	};
}

/**
 * The handoff's text: --text as given, else the file's contents, or stdin for
 * "-". `signal` ends a wait on stdin (Ctrl-C).
 */
export async function handoffText(command: HandoffCommand, signal?: AbortSignal): Promise<string> {
	if (command.text !== undefined) return command.text;
	return readSource(command.file ?? "", signal);
}
