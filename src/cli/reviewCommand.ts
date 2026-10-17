/**
 * `codepanel review`: show a review, trigger one, or wait for it to finish.
 */
import type { CodePanelClient, Question, ReviewSnapshot, TriggerResult } from "../lib/client";
import { triggerAndWait, type WaitOptions, type WaitResult, waitForReview } from "../lib/wait";
import type { Command } from "./args";

export interface ExecuteOptions extends Pick<WaitOptions, "sleep" | "now"> {
	/** Cancels a `review --wait` (e.g. on Ctrl-C). */
	signal?: AbortSignal;
}

/** `review`, which can also trigger a review and wait for it to finish. */
export function executeReview(
	command: Extract<Command, { kind: "review" }>,
	client: CodePanelClient,
	options: ExecuteOptions,
): Promise<unknown> {
	const target = { repo: command.repo, pr: command.pr };
	const wait = {
		signal: options.signal,
		sleep: options.sleep,
		now: options.now,
		timeoutMs: command.timeoutSeconds === undefined ? undefined : command.timeoutSeconds * 1000,
		headSha: command.sha,
		surface: "cli" as const,
	};
	const trigger = { ...target, panelId: command.panelId, traceparent: command.traceparent };
	if (command.trigger && command.wait) return triggerAndWait(client, trigger, wait);
	if (command.wait) return waitForReview(client, target, wait);
	return command.trigger
		? client.triggerReview(trigger)
		: client.getReview(command.repo, command.pr);
}

export const loc = (f: { file: string; line?: number | null }) =>
	f.line == null ? f.file : `${f.file}:${f.line}`;

type Payload = NonNullable<ReviewSnapshot["payload"]>;

/** One line per open finding, from payload.findings and its shared vocabulary when present. */
function findingLines(r: ReviewSnapshot): string[] {
	const findings = r.payload?.findings ?? r.findings;
	return findings.map((f) => {
		const state = f.state ?? f.status;
		return `${f.ref ? `${f.ref} ` : ""}[${f.severity}] ${loc(f)} — ${f.message}  (${state}${f.answered ? ", answered" : ""}, id ${f.id})`;
	});
}

export function formatReview(r: ReviewSnapshot): string {
	if (!r.found) return "No review for that pull request yet.";
	const head = `Status ${r.status}, round ${r.round ?? 0}: ${r.open.critical} critical, ${r.open.warning} warning, ${r.open.suggestion} suggestion`;
	const verdict = r.payload ? [verdictSummary(r.payload)] : [];
	const next = r.payload?.nextAction ? [nextActionLine(r.payload.nextAction)] : [];
	const stepBack = r.payload?.stepBack ? [stepBackLine(r.payload.stepBack)] : [];
	return [
		head,
		formatRounds(r.rounds, r.payload?.nextRound),
		formatGate(r.gate),
		...verdict,
		...next,
		...stepBack,
		...findingLines(r),
	].join("\n");
}

/** The server's next step, so the CLI never rebuilds it from the gate and verdict. */
function nextActionLine(next: NonNullable<Payload["nextAction"]>): string {
	const refs = next.refs.length > 0 ? ` ${next.refs.join(", ")}` : "";
	return `Next: ${next.action}${refs} (${next.reason}).`;
}

/** payload.stepBack: advice only; the Next line is still what to do. */
function stepBackLine(s: NonNullable<Payload["stepBack"]>): string {
	return `Step back: round ${s.rounds}, ${s.findingsAfterRound1} of ${s.totalFindings} findings first reported after round 1; ${s.reason}. Off with: codepanel repos set <repo> --step-back-after-rounds 0.`;
}

const STATUS_PROBLEM = {
	missing_permission: "The CodePanel GitHub App lacks the Commit statuses permission",
	refused: "GitHub refused the CodePanel commit status",
} as const;

/** Whether the pull request is blocked, and on what, so an agent knows when it is done. */
function formatGate(gate: ReviewSnapshot["gate"]): string {
	if (gate.level === "off") return "Gate: off.";
	const line = gate.blocking
		? `Gate: blocking until fixed or answered with /feedback: ${gate.unanswered.join(", ")}.`
		: "Gate: passing; every gated finding is fixed or answered.";
	if (gate.status === undefined || gate.status === "posted") return line;
	return `${line} ${STATUS_PROBLEM[gate.status]}, so this is the only gate.`;
}

/** One line on what to do next; `--json` prints the whole payload. */
function verdictSummary(p: Payload): string {
	const verdict = p.verdict === "blocked" ? `blocked by ${p.blockedBy.join(", ")}` : p.verdict;
	const reason = p.verdictReason ? ` (${p.verdictReason})` : "";
	return `Verdict: ${verdict}${reason}; next round: ${p.nextRound}`;
}

type NextRound = Payload["nextRound"];

/** The payload's nextRound in words; it also weighs auto-review and trigger settings. */
const NEXT_PUSH: Record<NextRound, string> = {
	"will-run-on-push": "the next push will be reviewed",
	"cap-reached": "the next push will not be reviewed",
	disabled: "pushes are not reviewed automatically",
};

/**
 * Where the PR stands against its automatic round limit. What the next push
 * does comes from the payload's nextRound when there is one, so this line
 * and the verdict line never disagree; without one, only the limit is told.
 */
function formatRounds(
	{ limit, perPr, completed, limitReached }: ReviewSnapshot["rounds"],
	nextRound?: NextRound,
): string {
	const own = perPr ? " (this pull request's own limit)" : "";
	const standing = limit === undefined ? "no limit" : `${completed} of ${limit}${own}`;
	// A server older than limitReached omits it; work it out the same way.
	// Drop this fallback once no such server is supported.
	const atLimit = limitReached ?? (limit !== undefined && completed >= limit);
	const reached = atLimit ? "; the limit is reached" : "";
	const next = nextRound ? `; ${NEXT_PUSH[nextRound]}` : reached;
	return `Automatic rounds: ${standing}${next}.`;
}

/** `review --trigger`: scheduled now, or queued behind the run that holds the pull request. */
export function formatTrigger(repo: string, pr: number, r: TriggerResult): string {
	const follow = `Follow it with: codepanel review ${repo}#${pr} --wait`;
	if (!r.queued) return `Review scheduled. ${follow}`;
	const behind = r.queuedBehind === "dispute" ? "a dispute run" : "a review round";
	return `Review queued behind ${behind} already running on this pull request; it starts when that run ends. ${follow}`;
}

export function formatWait(result: WaitResult): string {
	switch (result.status) {
		case "finished": {
			const seconds = Math.round(result.waitedMs / 1000);
			const head =
				result.outcome === "failed"
					? `Review failed after ${seconds}s: ${result.session.error ?? "unknown error"}`
					: `Review finished after ${seconds}s.`;
			return `${head}\n${formatReview(result.review)}`;
		}
		case "timeout":
		case "no_review":
			return result.message;
		case "aborted":
			return "Stopped waiting.";
	}
}

/** `review --wait` and `ask` exit codes; the docs (cli.md) list the same. */
export const REVIEW_EXIT = {
	done: 0,
	failed: 1,
	timeout: 3,
	gateBlocking: 4,
	interrupted: 130,
} as const;

/** An unanswered question: 1 when it failed, 3 when it is still pending, like a `--wait` timeout. */
function questionExitCode(q: Question): number {
	if (q.status === "failed") return REVIEW_EXIT.failed;
	return q.status === "pending" ? REVIEW_EXIT.timeout : REVIEW_EXIT.done;
}

/**
 * 0 for a finished review the gate passes, 4 when the gate still blocks, 1
 * for a failed round or none, 3 for a timeout, 130 for Ctrl-C. `ask` exits 1
 * when the question failed and 3 while it is still pending.
 */
export function exitCodeFor(command: Command, result: unknown): number {
	if (command.kind === "ask") return questionExitCode(result as Question);
	if (command.kind !== "review" || !command.wait) return REVIEW_EXIT.done;
	const r = result as WaitResult;
	switch (r.status) {
		case "finished":
			if (r.outcome !== "completed") return REVIEW_EXIT.failed;
			return r.review.gate.blocking ? REVIEW_EXIT.gateBlocking : REVIEW_EXIT.done;
		case "timeout":
			return REVIEW_EXIT.timeout;
		case "aborted":
			return REVIEW_EXIT.interrupted;
		default:
			return REVIEW_EXIT.failed;
	}
}
