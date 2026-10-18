/**
 * Reading argv: flags and positionals, and the arguments most commands share
 * (a repository, a pull request). Pure.
 */
import type { ReasoningEffort } from "../lib/client";
import { UsageError } from "./usageError";

const BOOLEAN_FLAGS = new Set(["json", "connectable", "trigger", "all", "help", "wait"]);
/**
 * Every option that takes a value. The tokenizer must know them: it cannot
 * tell `--jsn review` (a typo) from `--panel review` (a value) by looking at
 * the next token, and guessing swallowed it. A new option goes in one of
 * these two sets.
 */
const VALUE_FLAGS = new Set([
	"agent",
	"agent-files",
	"auto-review",
	"bot-max-rounds",
	"budget",
	"cap",
	"days",
	"effort",
	"file",
	"gate",
	"inline-suggestions",
	"limit",
	"max-auto-rounds",
	"model",
	"monthly",
	"name",
	"note",
	"pack",
	"panel",
	"pr",
	"prompt",
	"provider",
	"reason",
	"repo",
	"reviewer",
	"role",
	"scope",
	"scopes",
	"step-back-after-rounds",
	"sha",
	"status",
	"switches",
	"text",
	"threshold",
	"timeout",
	"traceparent",
	"url",
]);
/** A Map, not an object, so `--wait=constructor` finds no inherited key. */
const BOOLEAN_WORDS: ReadonlyMap<string, boolean> = new Map([
	["true", true],
	["1", true],
	["false", false],
	["0", false],
]);
const EFFORTS: readonly ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh", "max"];
const REPO = /^[\w.-]+\/[\w.-]+$/;
const HELP_SHORT_FLAG = "-h";
const END_OF_OPTIONS = "--";
/**
 * A dash, a letter and no whitespace (`-x`, `-x=1`, `-fix!`): a mistyped
 * option. Only positionals are checked; a value an option reads, as in
 * `--text -fix`, is taken as given since the option says what it is.
 */
const SHORT_OPTION = /^-[A-Za-z]\S*$/;

/** The server's MAX_AUTO_ROUNDS; the CLI imports no runtime code from convex/. */
export const MAX_ROUNDS = 50;

export interface Tokens {
	positionals: string[];
	/** A boolean option is true or false; every other option holds its value. */
	flags: Map<string, string | boolean>;
}

/** `--trigger=false` turns a boolean option off; anything but true/false/1/0 is a mistake. */
function booleanValue(name: string, inline: string): boolean {
	const value = BOOLEAN_WORDS.get(inline.toLowerCase());
	if (value === undefined) throw new UsageError(`--${name} must be true or false`);
	return value;
}

export function tokenize(argv: string[]): Tokens {
	const positionals: string[] = [];
	const flags = new Map<string, string | boolean>();
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		// `--` ends the options, as in most CLIs: free text after it may start with a dash.
		if (arg === END_OF_OPTIONS) {
			positionals.push(...argv.slice(i + 1));
			break;
		}
		if (arg === HELP_SHORT_FLAG) {
			flags.set("help", true);
			continue;
		}
		// `-` alone still means stdin, and text with whitespace ("-1 regression?") is text.
		if (SHORT_OPTION.test(arg)) {
			throw new UsageError(`unknown option ${arg} (put text that starts with a dash after --)`);
		}
		if (!arg.startsWith("--")) {
			positionals.push(arg);
			continue;
		}
		const [name = "", inline] = arg.slice(2).split(/=(.*)/s, 2);
		if (BOOLEAN_FLAGS.has(name)) {
			flags.set(name, inline === undefined ? true : booleanValue(name, inline));
		} else if (!VALUE_FLAGS.has(name)) {
			throw new UsageError(`unknown option --${name}`);
		} else if (inline !== undefined) {
			flags.set(name, inline);
		} else {
			const value = argv[++i];
			if (value === undefined || value.startsWith("--")) {
				throw new UsageError(`--${name} needs a value`);
			}
			flags.set(name, value);
		}
	}
	return { positionals, flags };
}

export class Reader {
	private readonly used = new Set<string>();
	constructor(private readonly tokens: Tokens) {}

	flag(name: string): string | undefined {
		this.used.add(name);
		const value = this.tokens.flags.get(name);
		return typeof value === "string" ? value : undefined;
	}

	bool(name: string): boolean {
		this.used.add(name);
		return this.tokens.flags.get(name) === true;
	}

	required(name: string): string {
		const value = this.flag(name);
		if (!value) throw new UsageError(`--${name} is required`);
		return value;
	}

	/** A panel member's id. `--agent` is the older spelling, still accepted. */
	reviewerId(): string {
		const value = this.flag("reviewer") ?? this.flag("agent");
		if (!value) throw new UsageError("--reviewer is required");
		return value;
	}

	effort(): ReasoningEffort | undefined {
		const value = this.flag("effort");
		if (value === undefined) return undefined;
		if (!(EFFORTS as readonly string[]).includes(value)) {
			throw new UsageError(`--effort must be one of: ${EFFORTS.join(", ")}`);
		}
		return value as ReasoningEffort;
	}

	/** Reject flags the command does not take, so a typo is not silently ignored. */
	done(): void {
		for (const name of this.tokens.flags.keys()) {
			if (name !== "json" && !this.used.has(name)) throw new UsageError(`unknown option --${name}`);
		}
	}
}

export function repoArg(value: string | undefined): string {
	if (!value || !REPO.test(value)) throw new UsageError("expected a repository as owner/name");
	return value;
}

/** A pull request number: a positive whole number. */
function prNumber(text: string | undefined): number {
	const n = Number(text);
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new UsageError("the pull request number must be a positive whole number");
	}
	return n;
}

/** `owner/name#123`, or `owner/name 123`. `rest` is what follows the pull request. */
export function prArg(positionals: string[]): { repo: string; pr: number; rest: string[] } {
	const [first, second] = positionals;
	const match = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(first ?? "");
	if (match) return { repo: match[1] ?? "", pr: prNumber(match[2]), rest: positionals.slice(1) };
	if (first && REPO.test(first) && second && /^\d+$/.test(second)) {
		return { repo: first, pr: prNumber(second), rest: positionals.slice(2) };
	}
	throw new UsageError("expected a pull request as owner/name#123");
}

/** Reject arguments a command has no use for, so `whoami extra` is not silently run. */
export function noExtra(positionals: string[]): void {
	if (positionals.length > 0) throw new UsageError(`unexpected argument: ${positionals[0]}`);
}
