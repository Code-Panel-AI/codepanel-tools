/**
 * Typed client for CodePanel's /api/v1, shared by the MCP server and the CLI.
 *
 * Response types come from ./apiTypes. See docs/api-and-agents.md.
 */
import type {
	ApiErrorCode,
	AutoReload,
	AutoReloadChange,
	AutoReloadUpdate,
	BudgetChange,
	BudgetState,
	ConnectableRepo,
	CreditsFirst,
	CreditsFirstChange,
	DismissDispute,
	FindingList,
	KeyStatus,
	Knowledge,
	KnowledgeReplaced,
	Learning,
	LearningAdded,
	LearningRated,
	LocalReviewStored,
	Model,
	Panel,
	Quality,
	Question,
	RatingResult,
	ReopenResult,
	Repo,
	ReviewBrief,
	ReviewSnapshot,
	ReviewStatus,
	RoleSummary,
	SessionDetail,
	SessionSummary,
	TriggerResult,
} from "./apiTypes";
import { type ClientConfig, callerHeaders } from "./clientConfig";

export type * from "./apiTypes";
export {
	type CallerInfo,
	type ClientConfig,
	configFromEnv,
	traceparentFromEnv,
} from "./clientConfig";

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

/** Why a finding was dismissed. Mirrors DISMISS_REASONS in convex/lib/dismissal.ts. */
export const DISMISS_REASONS = [
	"false_positive",
	"wrong_location",
	"not_worth_fixing",
	"duplicate",
	"deferred",
	"other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

/** Review switches a repository may set. Mirrors REPO_SWITCHES in convex/lib/reviewSwitches.ts. */
export const REPO_SWITCHES = [
	"REVIEW_CACHEABLE_PROMPTS",
	"REVIEW_REVIEWER_TOOLS",
	"REVIEW_PRECISION_RULES",
	"REVIEW_CHANGED_LINES",
	"REVIEW_LEARNING_ATTRIBUTION",
	"REVIEW_BASE_MERGE_SCOPE",
	"REVIEW_PROOF_GRADING",
	"REVIEW_NOVEL_ESCALATION",
] as const;
export type RepoSwitch = (typeof REPO_SWITCHES)[number];
/** true or false sets a switch for the repository, null follows the deployment again. */
export type ReviewSwitchesUpdate = Partial<Record<RepoSwitch, boolean | null>>;
/**
 * Each switch: the deployment's value (its default while unset), the
 * repository's own (null for none), the one used, and where that comes from.
 */
export type ReviewSwitchStates = Record<
	RepoSwitch,
	{
		deployment: boolean;
		override: boolean | null;
		effective: boolean;
		source: "repository" | "deployment" | "default";
	}
>;

/** Which findings must be answered before the commit status passes. Mirrors GATE_LEVELS in convex/lib/gate.ts. */
export const GATE_LEVELS = ["off", "critical", "warning", "all"] as const;
export type GateLevel = (typeof GATE_LEVELS)[number];

/** When findings are handed to a person. Mirrors ESCALATION_TRIGGERS in convex/lib/escalation.ts. */
export const ESCALATION_TRIGGERS = [
	"upheld_critical",
	"round_limit",
	"step_back",
	"novel",
] as const;
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];
/** Who to ask about findings no agent can settle; `triggers` absent means upheld_critical and round_limit. */
export interface EscalationSetting {
	contacts: string[];
	triggers?: EscalationTrigger[];
}

/** Why a finding was rated so. Mirrors FEEDBACK_REASONS in convex/lib/feedback.ts. */
export const FEEDBACK_REASONS = [
	"fixed",
	"useful",
	"false_positive",
	"wrong_location",
	"not_worth_fixing",
	"duplicate",
	"deferred",
	"unclear",
	"other",
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
export type FeedbackRating = "up" | "down";
/** The automatic round limit that now applies to the PR (null for none), and the rounds done. */
export interface RoundsResult {
	limit: number | null;
	completed: number;
	running: boolean;
	/** The head that pushes skipped at the old limit will be reviewed, if it was not. */
	reviewQueued: boolean;
}

/** POST /reviews/trigger. `traceparent` defaults to the client's own (ClientConfig). */
export interface TriggerArgs {
	repo: string;
	pr: number;
	panelId?: string;
	traceparent?: string;
}

/** The author agent's handoff for a pull request (POST /reviews/handoff). */
export interface HandoffArgs {
	repo: string;
	pr: number;
	text: string;
	sha?: string;
	agent?: string;
	authorAgent?: string;
	authorModel?: string;
}

export interface HandoffResult {
	ok: true;
	chars: number;
	truncated: boolean;
	headSha: string | null;
	usedBy: string;
	authorshipUsedBy?: string;
}

/** The author agent's own review of a commit, run from the brief (POST /reviews/local). */
export interface LocalReviewArgs {
	repo: string;
	headSha: string;
	pr?: number;
	agent?: string;
	verdict?: "ready" | "not-ready";
	findings: ReadonlyArray<{
		file: string;
		line?: number;
		severity: "critical" | "warning" | "suggestion";
		message: string;
		fixed: boolean;
	}>;
}

/** A rating names its finding by id, or by repo, PR and ref ("F3", or "review"). */
export interface RateArgs {
	findingId?: string;
	repo?: string;
	pr?: number;
	ref?: string;
	rating: FeedbackRating;
	/** A FeedbackReason, spelled as leniently as the server reads it ("false-positive", "fp"). */
	reason?: string;
	note?: string;
	/** Aliases for reason and note; accepted for single and batch ratings. */
	verdict?: string;
	comment?: string;
	/** Set when an AI agent is rating, e.g. "claude-code". */
	agent?: string;
}

/** Many ratings in one call; repo, pr and agent apply to each item that leaves them out. */
export interface RateManyArgs {
	repo?: string;
	pr?: number;
	agent?: string;
	ratings: Array<Omit<RateArgs, "agent">>;
}

/** One item of a batch: the rating's result, or the error it failed with. */
export type RateManyItem =
	| ({ ref?: string; ok: true } & RatingResult)
	| ({ ref?: string; ok: false; error: string } & ErrorDetails);

export interface RateManyResult {
	results: RateManyItem[];
	failed: number;
}

/** A dismissal names its finding by id, or by repo, PR and ref ("F3"). */
export interface DismissArgs extends FindingTarget {
	/** A DismissReason, spelled as leniently as the server reads it. */
	reason?: string;
	note?: string;
	/** Set when an AI agent dismisses, which disputes the finding instead. */
	agent?: string;
}

/** A question about a PR's review; `ref` ("F3") names a finding. */
export interface AskArgs {
	repo: string;
	pr: number;
	question: string;
	ref?: string;
	/** Set when an AI agent is asking, e.g. "claude-code". */
	agent?: string;
	/** false: return at once, pending, instead of waiting a while for the answer. */
	wait?: boolean;
}
/** `dispute` is set when an agent dismissed, which disputes the finding instead. */
export interface DismissResult {
	ok: true;
	dispute?: DismissDispute;
}
/** A finding by id, or by repo, PR and its ref ("F3"). */
export interface FindingTarget {
	findingId?: string;
	repo?: string;
	pr?: number;
	ref?: string;
}
/** A new learning; `agent` set when an AI agent adds it, so it waits for agreement. */
export interface AddLearningArgs {
	repo: string;
	text: string;
	scope?: string;
	pr?: number;
	agent?: string;
}

/** An up or down on a learning, named by its ref ("L3"). */
export interface RateLearningArgs {
	repo: string;
	ref: string;
	rating: FeedbackRating;
	/** A FeedbackReason, spelled as leniently as the server reads it. */
	reason?: string;
	note?: string;
	pr?: number;
	agent?: string;
}

export interface Me {
	githubUsername: string | null;
	token: string;
	scopes: string[];
}

export interface Ok {
	ok: true;
}

/** What a failed request's JSON body carries besides the message (convex/api/routes.ts errorBody). */
export interface ErrorDetails {
	code?: ApiErrorCode;
	/** Seconds to wait before retrying, for rate_limited. */
	retryAfter?: number;
	/** The scope the token lacks, for missing_scope. */
	scope?: string;
	/** For a precondition, its stable reason, e.g. "credits_required" (convex/lib/refusal.ts). */
	reason?: string;
}

/** An HTTP failure, carrying the server's message and its stable code. */
export class CodePanelError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly details: ErrorDetails = {},
	) {
		super(message);
		this.name = "CodePanelError";
	}

	get code(): ApiErrorCode | undefined {
		return this.details.code;
	}
}

/** GET sends each value as a query string; POST sends the object, arrays included, as JSON. */
type Input = Record<string, unknown>;

/**
 * Reads a response as JSON. An empty body is null (some routes answer with
 * nothing); a body that is not JSON is null too, so a failure still reports
 * its status, and `parsed` says which of the two it was.
 */
async function readBody(response: Response): Promise<{ parsed: boolean; body: unknown }> {
	const text = await response.text();
	if (text === "") return { parsed: true, body: null };
	try {
		return { parsed: true, body: JSON.parse(text) };
	} catch {
		return { parsed: false, body: null };
	}
}

function errorFrom(response: Response, body: unknown): CodePanelError {
	const { error, code, retryAfter, scope, reason } = (body ?? {}) as {
		error?: string;
	} & ErrorDetails;
	return new CodePanelError(response.status, error ?? `HTTP ${response.status}`, {
		...(code === undefined ? {} : { code }),
		...(retryAfter === undefined ? {} : { retryAfter }),
		...(scope === undefined ? {} : { scope }),
		...(reason === undefined ? {} : { reason }),
	});
}

/** Paths GET /review-brief reads (MAX_BRIEF_PATHS in convex/lib/reviewBrief.ts). */
export const MAX_BRIEF_PATHS = 200;

/** Characters of encoded paths one GET carries, well inside common proxy URL limits. */
export const MAX_BRIEF_PATHS_QUERY_CHARS = 16_000;

/**
 * The `paths` query value: comma-separated, as the route splits it. A path
 * with a comma cannot travel that way, so it is skipped, as is every path
 * past MAX_BRIEF_PATHS or MAX_BRIEF_PATHS_QUERY_CHARS; `skipped` counts them.
 */
export function briefPathsParam(paths: ReadonlyArray<string>): {
	param: string | undefined;
	skipped: number;
} {
	const kept: string[] = [];
	let size = 0;
	for (const path of paths) {
		// Measured as sent, with the encoder request() uses, plus an encoded comma.
		const encoded = new URLSearchParams({ p: path }).toString().length - 2 + 3;
		const fits = size + encoded <= MAX_BRIEF_PATHS_QUERY_CHARS;
		if (path.includes(",") || !fits || kept.length >= MAX_BRIEF_PATHS) continue;
		kept.push(path);
		size += encoded;
	}
	return {
		param: kept.length > 0 ? kept.join(",") : undefined,
		skipped: paths.length - kept.length,
	};
}

export class CodePanelClient {
	private readonly base: string;
	private readonly fetchImpl: typeof fetch;

	/**
	 * `signal` cancels every request this client makes, including one in
	 * flight: Ctrl-C in the CLI, or the MCP client cancelling a tool call.
	 */
	constructor(
		private readonly config: ClientConfig,
		private readonly signal?: AbortSignal,
	) {
		this.base = `${config.url.replace(/\/+$/, "")}/api/v1`;
		this.fetchImpl = config.fetch ?? fetch;
	}

	/** The same client with `signal` also cancelling its requests. */
	withSignal(signal: AbortSignal): CodePanelClient {
		return new CodePanelClient(
			this.config,
			this.signal ? AbortSignal.any([this.signal, signal]) : signal,
		);
	}

	/** Public so AdminClient (adminClient.ts) reuses the auth, query and error handling. */
	async request<T>(method: "GET" | "POST", path: string, input: Input = {}): Promise<T> {
		const defined = Object.entries(input).filter(([, v]) => v !== undefined);
		let url = `${this.base}${path}`;
		const init: RequestInit = {
			method,
			headers: {
				Authorization: `Bearer ${this.config.token}`,
				...callerHeaders(this.config.caller?.()),
			},
		};
		if (this.signal) init.signal = this.signal;
		if (method === "GET") {
			if (defined.length) url += `?${new URLSearchParams(defined.map(([k, v]) => [k, String(v)]))}`;
		} else {
			init.headers = { ...init.headers, "Content-Type": "application/json" };
			init.body = JSON.stringify(Object.fromEntries(defined));
		}

		const response = await this.fetchImpl(url, init);
		const { parsed, body } = await readBody(response);
		if (!response.ok) throw errorFrom(response, body);
		if (!parsed) {
			throw new CodePanelError(
				response.status,
				`Unexpected non-JSON response from ${this.base}${path}. Is CODEPANEL_URL your deployment's .convex.site URL?`,
			);
		}
		return body as T;
	}

	me = () => this.request<Me>("GET", "/me");

	listRepos = () => this.request<Repo[]>("GET", "/repos");
	listConnectableRepos = () => this.request<ConnectableRepo[]>("GET", "/github/repos");
	connectRepo = (repo: string) =>
		this.request<{ repoId: string; fullName: string; webhookInstalled: boolean }>(
			"POST",
			"/repos/connect",
			{ repo },
		);
	disconnectRepo = (repo: string) => this.request<Ok>("POST", "/repos/disconnect", { repo });
	updateRepoSettings = (args: {
		repo: string;
		autoReview?: boolean;
		maxAutoRounds?: number | null;
		botMaxRounds?: number | null;
		stepBackAfterRounds?: number | null;
		inlineSuggestions?: boolean;
		panelId?: string | null;
		gate?: GateLevel;
		agentFiles?: boolean;
		reviewSwitches?: ReviewSwitchesUpdate;
		escalation?: EscalationSetting | null;
	}) => this.request<Ok & { reviewSwitches: ReviewSwitchStates }>("POST", "/repos/settings", args);
	getRepoSwitches = (repo: string) =>
		this.request<{ repo: string; reviewSwitches: ReviewSwitchStates }>("GET", "/repos/switches", {
			repo,
		});
	getBudget = (repo?: string) => this.request<BudgetState>("GET", "/budget", { repo });
	setBudget = (args: {
		monthlyUsd?: number | "default" | null;
		repo?: string;
		capUsd?: number | null;
	}) => this.request<BudgetChange>("POST", "/budget", args);
	getAutoReload = () => this.request<AutoReload>("GET", "/auto-reload");
	setAutoReload = (args: AutoReloadUpdate) =>
		this.request<AutoReloadChange>("POST", "/auto-reload", args);
	getCreditsFirst = () => this.request<CreditsFirst>("GET", "/credits-first");
	/** null goes back to the default (on). */
	setCreditsFirst = (enabled: boolean | null) =>
		this.request<CreditsFirstChange>("POST", "/credits-first", { enabled });

	listPanels = () => this.request<Panel[]>("GET", "/panels");
	listModels = () => this.request<Model[]>("GET", "/models");
	listRoles = () => this.request<RoleSummary[]>("GET", "/roles");
	addReviewer = (args: {
		panelId: string;
		role?: string;
		provider?: string;
		modelId?: string;
		reasoningEffort?: ReasoningEffort;
		name?: string;
		systemPrompt?: string;
	}) => this.request<{ agentId: string }>("POST", "/panels/reviewers/add", args);
	removeReviewer = (args: { panelId: string; agentId: string }) =>
		this.request<Ok>("POST", "/panels/reviewers/remove", args);
	updateMember = (args: {
		agentId: string;
		provider?: string;
		modelId?: string;
		reasoningEffort?: ReasoningEffort;
		systemPrompt?: string;
	}) => this.request<Ok>("POST", "/panels/members/update", args);
	setOrchestrator = (args: {
		panelId: string;
		provider: string;
		modelId: string;
		reasoningEffort?: ReasoningEffort;
	}) => this.request<{ agentId: string }>("POST", "/panels/orchestrator", args);
	updatePanel = (args: { panelId: string; name?: string; budgetUsd?: number | null }) =>
		this.request<Ok>("POST", "/panels/update", args);

	keyStatus = () => this.request<KeyStatus[]>("GET", "/keys");

	triggerReview = (args: TriggerArgs) =>
		this.request<TriggerResult>("POST", "/reviews/trigger", {
			...args,
			traceparent: args.traceparent ?? this.config.traceparent,
		});
	setRounds = (args: { repo: string; pr: number; rounds: string }) =>
		this.request<RoundsResult>("POST", "/reviews/rounds", args);
	getReview = (repo: string, pr: number) =>
		this.request<ReviewSnapshot>("GET", "/review", { repo, pr });
	getReviewStatus = (repo: string, pr: number) =>
		this.request<ReviewStatus>("GET", "/reviews/status", { repo, pr });
	listSessions = (args: {
		repo?: string;
		status?: "active" | "completed" | "all";
		limit?: number;
	}) => this.request<SessionSummary[]>("GET", "/sessions", args);
	getSession = (id: string) => this.request<SessionDetail>("GET", "/sessions/get", { id });
	listFindings = (args: { repo: string; pr: number; includeResolved?: boolean }) =>
		this.request<FindingList>("GET", "/findings", args);
	/** With `agent` set it disputes the finding instead, and says where the dispute stands. */
	dismissFinding = (args: DismissArgs) =>
		this.request<DismissResult>("POST", "/findings/dismiss", { ...args });
	reopenFinding = (target: FindingTarget) =>
		this.request<ReopenResult>("POST", "/findings/reopen", { ...target });
	getKnowledge = (repo: string) => this.request<Knowledge>("GET", "/knowledge", { repo });
	replaceKnowledge = (repo: string, markdown: string) =>
		this.request<KnowledgeReplaced>("POST", "/knowledge", { repo, markdown });
	rate = (args: RateArgs) => this.request<RatingResult>("POST", "/feedback", { ...args });
	rateMany = (args: RateManyArgs) => this.request<RateManyResult>("POST", "/feedback", { ...args });
	ask = (args: AskArgs) => this.request<Question>("POST", "/reviews/ask", { ...args });
	getQuestion = (id: string) => this.request<Question>("GET", "/reviews/ask", { id });
	listLearnings = (repo: string) => this.request<Learning[]>("GET", "/learnings", { repo });
	addLearning = (args: AddLearningArgs) =>
		this.request<LearningAdded>("POST", "/learnings", { ...args });
	rateLearning = (args: RateLearningArgs) =>
		this.request<LearningRated>("POST", "/learnings/feedback", { ...args });
	/** None means every active learning; `paths.used` in the reply says which were read. */
	getReviewBrief = (repo: string, paths?: ReadonlyArray<string>) =>
		this.request<ReviewBrief>("GET", "/review-brief", {
			repo,
			paths: briefPathsParam(paths ?? []).param,
		});
	getQuality = (repo: string, days?: number) =>
		this.request<Quality>("GET", "/quality", { repo, days });
	submitHandoff = (args: HandoffArgs) =>
		this.request<HandoffResult>("POST", "/reviews/handoff", { ...args });
	submitLocalReview = (args: LocalReviewArgs) =>
		this.request<LocalReviewStored>("POST", "/reviews/local", { ...args });
}
