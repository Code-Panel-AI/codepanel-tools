/**
 * `codepanel knowledge owner/name` prints a repo's review knowledge as
 * Markdown; `codepanel knowledge set owner/name <file|->` replaces its rules
 * and notes with an edited copy read from a file or stdin.
 */
import { noExtra, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type KnowledgeCommand =
	| { kind: "knowledge"; repo: string }
	| {
			kind: "knowledge.set";
			repo: string;
			/** A file path, or "-" for stdin. */
			source: string;
	  };

export const STDIN_SOURCE = "-";

export { repoArg };

/** `positionals` are what follows `knowledge`. */
export function parseKnowledge(positionals: string[]): KnowledgeCommand {
	const [first, ...rest] = positionals;
	if (first === "set") {
		const [repo, source, ...extra] = rest;
		noExtra(extra);
		const checked = repoArg(repo);
		if (!source) throw new UsageError("expected a Markdown file, or - for stdin");
		return { kind: "knowledge.set", repo: checked, source };
	}
	noExtra(rest);
	return { kind: "knowledge", repo: repoArg(first) };
}
