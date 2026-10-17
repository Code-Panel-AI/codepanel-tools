/**
 * Commands about a repository rather than a pull request:
 *
 *   codepanel knowledge <owner/name>                       (knowledgeArgs.ts)
 *   codepanel learnings <owner/name>
 *   codepanel learn <owner/name> <text...> [--scope p] [--pr n] [--agent a]
 *   codepanel learning <owner/name> L3 up|down [--reason r] [--note n] [--pr n] [--agent a]
 */
import { FEEDBACK_REASONS, type FeedbackRating, type FeedbackReason } from "../lib/client";
import { type KnowledgeCommand, parseKnowledge } from "./knowledgeArgs";
import { noExtra, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type LearningCommand =
	| { kind: "learnings"; repo: string }
	| { kind: "learn"; repo: string; text: string; scope?: string; pr?: number; agent?: string }
	| {
			kind: "learning";
			repo: string;
			ref: string;
			rating: FeedbackRating;
			reason?: FeedbackReason;
			note?: string;
			pr?: number;
			agent?: string;
	  };

interface FlagReader {
	flag(name: string): string | undefined;
}

function prFlag(r: FlagReader): number | undefined {
	const value = r.flag("pr");
	if (value === undefined) return undefined;
	if (!/^[1-9]\d*$/.test(value)) throw new UsageError("--pr must be a pull request number");
	return Number(value);
}

function reasonFlag(r: FlagReader): FeedbackReason | undefined {
	const reason = r.flag("reason")?.replace(/-/g, "_");
	if (reason !== undefined && !(FEEDBACK_REASONS as readonly string[]).includes(reason)) {
		throw new UsageError(`--reason must be one of: ${FEEDBACK_REASONS.join(", ")}`);
	}
	return reason as FeedbackReason | undefined;
}

function parseRating(repo: string, rest: string[], r: FlagReader): LearningCommand {
	const [ref, word, ...extra] = rest;
	if (!ref || !/^l[1-9]\d*$/i.test(ref)) throw new UsageError("expected a learning like L3");
	const rating = word === "up" || word === "down" ? word : undefined;
	if (!rating) throw new UsageError("expected up or down after the learning");
	noExtra(extra);
	return {
		kind: "learning",
		repo,
		ref: ref.toUpperCase(),
		rating,
		reason: reasonFlag(r),
		note: r.flag("note"),
		pr: prFlag(r),
		agent: r.flag("agent"),
	};
}

/** `group` is the command word; `rest` what follows it. */
export function parseRepoCommand(
	group: string,
	rest: string[],
	r: FlagReader,
): KnowledgeCommand | LearningCommand {
	if (group === "knowledge") return parseKnowledge(rest);
	if (group !== "learnings" && group !== "learn" && group !== "learning") {
		throw new UsageError(`unknown command: ${group}`);
	}
	const [first, ...more] = rest;
	const repo = repoArg(first);
	if (group === "learnings") {
		noExtra(more);
		return { kind: "learnings", repo };
	}
	if (group === "learning") return parseRating(repo, more, r);
	const text = more.join(" ").trim();
	if (!text) throw new UsageError("expected the learning's text");
	return {
		kind: "learn",
		repo,
		text,
		scope: r.flag("scope"),
		pr: prFlag(r),
		agent: r.flag("agent"),
	};
}
