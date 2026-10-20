/**
 * Review commands: `review`, `sessions`, `session`, `findings`, `rounds`.
 */
import { DISMISS_REASONS, type DismissReason } from "../lib/client";
import type { LocalReviewCommand } from "./localReview";
import { MAX_ROUNDS, noExtra, prArg, type Reader, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type ReviewCommand =
	| {
			kind: "review";
			repo: string;
			pr: number;
			trigger: boolean;
			panelId?: string;
			wait: boolean;
			timeoutSeconds?: number;
			sha?: string;
			/** Overrides $TRACEPARENT for the review this triggers. */
			traceparent?: string;
	  }
	| LocalReviewCommand
	| { kind: "sessions"; repo?: string; status?: "active" | "completed" | "all"; limit?: number }
	| { kind: "session"; id: string }
	| { kind: "findings"; repo: string; pr: number; all: boolean }
	| {
			kind: "findings.dismiss";
			findingId: string;
			reason?: DismissReason;
			note?: string;
			/** Set (or $CODEPANEL_AGENT) when an agent dismisses: it disputes instead. */
			agent?: string;
	  }
	| { kind: "findings.reopen"; findingId?: string; repo?: string; pr?: number; ref?: string }
	| { kind: "rounds"; repo: string; pr: number; rounds: string };

/** Flags of a panel review that a local brief has no use for. */
const NOT_LOCAL = ["trigger", "wait", "panel", "timeout", "sha", "traceparent"];

/** `review --local [owner/name] [--paths a,b]`: the brief, not a review. */
function parseLocalReview(positionals: string[], r: Reader): LocalReviewCommand {
	for (const name of NOT_LOCAL) {
		if (r.bool(name) || r.flag(name) !== undefined) {
			throw new UsageError(`--${name} does not go with --local`);
		}
	}
	const [first, ...extra] = positionals;
	noExtra(extra);
	const repo = first === undefined ? undefined : repoArg(first.replace(/#\d+$/, ""));
	const paths = r
		.flag("paths")
		?.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	return { kind: "review.local", repo, paths: paths?.length ? paths : undefined };
}

export function parseReview(positionals: string[], r: Reader): ReviewCommand {
	if (r.bool("local")) return parseLocalReview(positionals, r);
	const { repo, pr, rest } = prArg(positionals);
	noExtra(rest);
	const wait = r.bool("wait");
	const trigger = r.bool("trigger");
	const panelId = r.flag("panel");
	if (panelId !== undefined && !trigger) throw new UsageError("--panel only goes with --trigger");
	const timeout = r.flag("timeout");
	const sha = r.flag("sha");
	if ((timeout !== undefined || sha !== undefined) && !wait) {
		throw new UsageError("--timeout and --sha only go with --wait");
	}
	const traceparent = r.flag("traceparent");
	if (traceparent !== undefined && !trigger) {
		throw new UsageError("--traceparent only goes with --trigger");
	}
	if (sha !== undefined && !/^[0-9a-f]{7,40}$/i.test(sha)) {
		throw new UsageError("--sha must be a commit sha (7 to 40 hex characters)");
	}
	if (timeout !== undefined && !/^[1-9]\d*$/.test(timeout)) {
		throw new UsageError("--timeout must be a positive number of seconds");
	}
	return {
		kind: "review",
		repo,
		pr,
		trigger,
		panelId,
		wait,
		timeoutSeconds: timeout === undefined ? undefined : Number.parseInt(timeout, 10),
		sha,
		traceparent,
	};
}

export function parseSessions(positionals: string[], r: Reader): ReviewCommand {
	noExtra(positionals);
	const status = r.flag("status");
	if (status !== undefined && !["active", "completed", "all"].includes(status)) {
		throw new UsageError("--status must be active, completed or all");
	}
	const limit = r.flag("limit");
	if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) {
		throw new UsageError("--limit must be a positive integer");
	}
	return {
		kind: "sessions",
		repo: r.flag("repo") === undefined ? undefined : repoArg(r.flag("repo")),
		status: status as "active" | "completed" | "all" | undefined,
		limit: limit === undefined ? undefined : Number.parseInt(limit, 10),
	};
}

function parseDismiss(positionals: string[], r: Reader): ReviewCommand {
	const [findingId, ...extra] = positionals;
	if (!findingId) throw new UsageError("expected a finding id");
	noExtra(extra);
	const reason = r.flag("reason");
	if (reason !== undefined && !(DISMISS_REASONS as readonly string[]).includes(reason)) {
		throw new UsageError(`--reason must be one of: ${DISMISS_REASONS.join(", ")}`);
	}
	return {
		kind: "findings.dismiss",
		findingId,
		reason: reason as DismissReason | undefined,
		note: r.flag("note"),
		agent: r.flag("agent"),
	};
}

/** `reopen <findingId>`, or `reopen <owner/name#123> F3` as the review comment names it. */
function parseReopen(positionals: string[]): ReviewCommand {
	const [first] = positionals;
	if (!first)
		throw new UsageError("expected a finding id, or owner/name#123 and a finding like F3");
	if (positionals.length === 1 && !first.includes("/")) {
		return { kind: "findings.reopen", findingId: first };
	}
	const { repo, pr, rest } = prArg(positionals);
	if (!rest[0]) throw new UsageError("expected a finding like F3 after the pull request");
	noExtra(rest.slice(1));
	return { kind: "findings.reopen", repo, pr, ref: rest[0] };
}

export function parseFindings(positionals: string[], r: Reader): ReviewCommand {
	if (positionals[0] === "dismiss") return parseDismiss(positionals.slice(1), r);
	if (positionals[0] === "reopen") return parseReopen(positionals.slice(1));
	const { repo, pr, rest } = prArg(positionals);
	noExtra(rest);
	return { kind: "findings", repo, pr, all: r.bool("all") };
}

/** What the server reads after `/rounds`: a count, +N, or a word for stop, reset or one more. */
const ROUNDS_WORDS = new Set([
	...["stop", "done", "end", "off", "none"],
	...["reset", "default", "clear"],
	...["more", "continue", "another", "next"],
]);

function roundsArg(value: string | undefined): string {
	const word = value?.toLowerCase();
	if (word === undefined || word === "") {
		throw new UsageError("expected a number of rounds, +N, stop or reset");
	}
	if (ROUNDS_WORDS.has(word)) return word;
	const count = /^\+?(\d+)$/.exec(word)?.[1];
	if (
		count === undefined ||
		Number(count) > MAX_ROUNDS ||
		(word.startsWith("+") && !Number(count))
	) {
		throw new UsageError(`rounds must be a number from 0 to ${MAX_ROUNDS}, +N, stop or reset`);
	}
	return word;
}

export function parseRounds(positionals: string[]): ReviewCommand {
	const { repo, pr, rest } = prArg(positionals);
	noExtra(rest.slice(1));
	return { kind: "rounds", repo, pr, rounds: roundsArg(rest[0]) };
}
