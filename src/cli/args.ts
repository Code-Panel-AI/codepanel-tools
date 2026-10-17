/**
 * CLI argument parsing: argv in, a typed command out. Pure, so every command
 * shape is tested without a network. Each group of commands has its own
 * parser (setupArgs, reviewArgs, feedbackArgs, learningArgs); this file
 * routes to them.
 */
import type { Command } from "./command";
import { parseAsk, parseFeedback } from "./feedbackArgs";
import { parseHandoff } from "./handoffArgs";
import { parseRepoCommand } from "./learningArgs";
import { parseQuality } from "./qualityCommand";
import { parseFindings, parseReview, parseRounds, parseSessions } from "./reviewArgs";
import { parseBudget } from "./settingsCommand";
import { parsePanel, parseRepos } from "./setupArgs";
import { noExtra, prArg, Reader, tokenize } from "./tokens";
import { UsageError } from "./usageError";

export type { Command } from "./command";
export { UsageError } from "./usageError";

export interface Parsed {
	command: Command;
	json: boolean;
}

function parsePrCommand(group: string, rest: string[], r: Reader): Command {
	const { repo, pr, rest: more } = prArg(rest);
	if (group === "handoff") return parseHandoff(repo, pr, more, r);
	return group === "ask" ? parseAsk(repo, pr, more, r) : parseFeedback(repo, pr, more, r);
}

function parseCommand(positionals: string[], r: Reader): Command {
	const [group, ...rest] = positionals;
	switch (group) {
		case undefined:
		case "help":
			return { kind: "help" };
		case "whoami":
		case "models":
		case "keys":
		case "logout":
			noExtra(rest);
			return { kind: group };
		case "login":
			noExtra(rest);
			return { kind: "login", url: r.flag("url"), scopes: r.flag("scopes"), name: r.flag("name") };
		case "repos":
			return parseRepos(rest[0], rest.slice(1), r);
		case "panel":
			return parsePanel(rest, r);
		case "review":
			return parseReview(rest, r);
		case "sessions":
			return parseSessions(rest, r);
		case "session":
			if (!rest[0]) throw new UsageError("expected a session id");
			noExtra(rest.slice(1));
			return { kind: "session", id: rest[0] };
		case "findings":
			return parseFindings(rest, r);
		case "feedback":
		case "ask":
		case "handoff":
			return parsePrCommand(group, rest, r);
		case "rounds":
			return parseRounds(rest);
		case "quality":
			noExtra(rest.slice(1));
			return parseQuality(rest, r);
		case "budget":
			// `budget set` rejects its own extras with a clearer message.
			noExtra(rest[0] === "set" ? [] : rest.slice(1));
			return parseBudget(rest, r);
		default:
			return parseRepoCommand(group, rest, r);
	}
}

export function parseArgs(argv: string[]): Parsed {
	const tokens = tokenize(argv);
	const reader = new Reader(tokens);
	if (reader.bool("help")) return { command: { kind: "help" }, json: false };
	const command = parseCommand(tokens.positionals, reader);
	reader.done();
	return { command, json: tokens.flags.get("json") === true };
}

export { USAGE } from "./usage";
