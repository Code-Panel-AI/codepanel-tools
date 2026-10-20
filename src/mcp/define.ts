/**
 * What every MCP tool definition is made of: its shape, a typed constructor,
 * and the input fields most tools share.
 */
import { z } from "zod";
import { type CodePanelClient, ESCALATION_TRIGGERS } from "../lib/client";

export const repo = z
	.string()
	.regex(/^[\w.-]+\/[\w.-]+$/)
	.describe("Repository as owner/name");
export const pr = z.number().int().positive().describe("Pull request number");
/** A PR's automatic round limit: a count, or "+N", "stop" or "reset" as in `/rounds`. */
export const rounds = z
	.union([z.number().int().min(0).max(50), z.string()])
	.describe('1 to 50, "+N", "stop" or "reset"');
/** The repository's cap on automatic rounds per pull request. */
const maxAutoRounds = z
	.number()
	.int()
	.min(1)
	.max(50)
	.nullable()
	.optional()
	.describe(
		"Automatic review rounds per pull request (1-50), or null for no limit. /review still runs past it.",
	);
/** How many rounds in all a bot may extend a pull request to with `/rounds`. */
const botMaxRounds = z
	.number()
	.int()
	.min(0)
	.max(50)
	.nullable()
	.optional()
	.describe(
		"Rounds in all a bot commenting /rounds may extend a pull request to (0-50; 0 stops bots adding rounds), or null for the default of 5. Owners, members and collaborators are not held to it.",
	);
/** The round from which reviews carry the step-back notice. */
const stepBackAfterRounds = z
	.number()
	.int()
	.min(0)
	.max(50)
	.nullable()
	.optional()
	.describe(
		"The round from which the review carries a step-back notice (payload.stepBack) advising to reconsider the approach rather than patch the latest finding (0-50; 0 turns it off), or null for the default of 3. It stops nothing and never changes the gate.",
	);
/** A repository's round settings, as update_repo_settings takes them. */
export const roundSettings = { maxAutoRounds, botMaxRounds, stepBackAfterRounds };
/** Who to ask about findings no agent can settle (payload.escalation). */
export const escalation = z
	.object({
		contacts: z.array(z.string()).min(1).max(5).describe("1-5 GitHub logins to ask, @ optional"),
		triggers: z
			.array(z.enum(ESCALATION_TRIGGERS))
			.min(1)
			.optional()
			.describe(
				"When to ask: upheld_critical (a critical the orchestrator upheld after the author's dispute), round_limit (a critical left at the round limit), step_back (anything gated left while the step-back notice shows), novel (a warning or critical the orchestrator judged a decision for a person; needs REVIEW_NOVEL_ESCALATION on). Absent means upheld_critical and round_limit.",
			),
	})
	.nullable()
	.optional()
	.describe(
		"Escalate findings no agent can settle to these people: nextAction becomes escalate, the commit status names them and one PR comment asks them to answer with /feedback. Null clears it; absent leaves it. Off unless set.",
	);
export const panelId = z.string().describe("Panel id, from get_panel");

/** What the server hands a running tool besides its arguments. */
export interface ToolContext {
	/** Fires when the client cancels the call. */
	signal?: AbortSignal;
	/** Lets a long call tell the client it is still alive. */
	progress?: (message: string) => void;
	/** The clock a waiting tool polls by. Injected in tests. */
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	now?: () => number;
}

export interface ToolDef {
	name: string;
	/** Human-readable name shown by clients and required by the Claude connectors directory. */
	title: string;
	description: string;
	input: z.ZodRawShape;
	/** False for reads. Writes are flagged so clients can ask before running them. */
	writes: boolean;
	run: (
		client: CodePanelClient,
		args: Record<string, unknown>,
		context?: ToolContext,
	) => Promise<unknown>;
}

/** Narrow `args` to the tool's declared shape. The SDK has already validated it. */
export function tool<S extends z.ZodRawShape>(def: {
	name: string;
	title: string;
	description: string;
	input: S;
	writes: boolean;
	run: (
		client: CodePanelClient,
		args: z.infer<z.ZodObject<S>>,
		context: ToolContext,
	) => Promise<unknown>;
}): ToolDef {
	return def as unknown as ToolDef;
}
