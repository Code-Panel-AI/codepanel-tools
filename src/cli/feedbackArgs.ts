/**
 * `codepanel feedback owner/name#123 F3 down --reason false_positive --note "…"`:
 * rate a finding (or `review`, the whole review) as an agent or a person.
 */
import { FEEDBACK_REASONS, type FeedbackRating, type FeedbackReason } from "../lib/client";
import { noExtra } from "./tokens";
import { UsageError } from "./usageError";

export interface FeedbackCommand {
	kind: "feedback";
	repo: string;
	pr: number;
	/** "F3", "3" or "review". */
	ref: string;
	rating: FeedbackRating;
	reason?: FeedbackReason;
	note?: string;
	agent?: string;
}

const RATINGS: Record<string, FeedbackRating> = {
	up: "up",
	"+1": "up",
	down: "down",
	"-1": "down",
};

interface FlagReader {
	flag(name: string): string | undefined;
}

export function parseFeedback(
	repo: string,
	pr: number,
	positionals: string[],
	r: FlagReader,
): FeedbackCommand {
	const [ref, ratingWord, ...extra] = positionals.filter(Boolean);
	if (!ref || !/^(f?\d+|review)$/i.test(ref)) {
		throw new UsageError("expected a finding like F3, or review");
	}
	const rating = RATINGS[(ratingWord ?? "").toLowerCase()];
	if (!rating) throw new UsageError("expected up or down after the finding");
	noExtra(extra);
	const reason = r.flag("reason")?.replace(/-/g, "_");
	if (reason !== undefined && !(FEEDBACK_REASONS as readonly string[]).includes(reason)) {
		throw new UsageError(`--reason must be one of: ${FEEDBACK_REASONS.join(", ")}`);
	}
	return {
		kind: "feedback",
		repo,
		pr,
		ref,
		rating,
		reason: reason as FeedbackReason | undefined,
		note: r.flag("note"),
		agent: r.flag("agent"),
	};
}

/**
 * `codepanel ask owner/name#123 [F3] <question…> [--agent name] [--timeout secs]`:
 * ask the review's orchestrator, and wait for the answer.
 */
export interface AskCommand {
	kind: "ask";
	repo: string;
	pr: number;
	ref?: string;
	question: string;
	agent?: string;
	timeoutSeconds?: number;
}

export function parseAsk(
	repo: string,
	pr: number,
	positionals: string[],
	r: FlagReader,
): AskCommand {
	const words = positionals.filter(Boolean);
	const ref = words[0] && /^f\d+$/i.test(words[0]) ? words.shift() : undefined;
	const question = words.join(" ").trim();
	if (!question) throw new UsageError("expected a question");
	const timeout = r.flag("timeout");
	if (timeout !== undefined && !/^[1-9]\d*$/.test(timeout)) {
		throw new UsageError("--timeout must be a positive number of seconds");
	}
	return {
		kind: "ask",
		repo,
		pr,
		...(ref ? { ref: ref.toUpperCase() } : {}),
		question,
		agent: r.flag("agent"),
		...(timeout ? { timeoutSeconds: Number.parseInt(timeout, 10) } : {}),
	};
}
