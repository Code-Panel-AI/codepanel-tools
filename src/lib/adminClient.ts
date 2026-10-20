/**
 * Client for the operator routes under /api/v1/admin (docs/api-and-agents.md).
 * They need an admin token: an API token carrying only the `admin` scope,
 * minted on /admin. It composes CodePanelClient so requests and errors are
 * handled in one place.
 */

import type { AdminEvals } from "./adminEvalsTypes";
import type { AdminQuality } from "./adminQualityTypes";
import { type ClientConfig, CodePanelClient, configFromEnv } from "./client";
import { TOKEN_PATTERN } from "./clientConfig";
import type { StoredCredentials } from "./credentials";

export type { AdminEvalRun, AdminEvals, AdminEvalWorkflow } from "./adminEvalsTypes";
export type { AdminQuality, AdminQualityModel, AdminVerified } from "./adminQualityTypes";

export type AdminStatus = "ok" | "attention";

export interface AdminOverview {
	status: AdminStatus;
	problems: {
		area:
			| "system"
			| "treasury"
			| "revenue"
			| "reviews"
			| "repos"
			| "models"
			| "quality"
			| "evals"
			| "inbox";
		problem: string;
		path: string;
	}[];
	figures: {
		days: number;
		signups: number;
		reviews: number;
		failedReviews: number;
		platformCostUsd: number;
		creditsSoldUsd: number;
	};
	newestUsers: { userId: string; login: string | null; createdAt: number; plan: AdminPlan }[];
}

export type AdminFeedbackTopic = "idea" | "bug" | "pricing" | "other";

/** GET /admin/inbox (convex/admin/inboxValidators.ts). */
export interface AdminInbox extends AdminReport {
	topic: AdminFeedbackTopic | null;
	unhandled: { count: number; stale: number; staleHours: number; truncated: boolean };
	rows: {
		id: string;
		topic: AdminFeedbackTopic;
		message: string;
		email: string | null;
		userId: string | null;
		login: string | null;
		createdAt: number;
		handledAt: number | null;
		handledReason: string | null;
	}[];
	rowsTruncated: boolean;
}

/** What marking a message handled or unhandled answers; `undo` is the call that reverses it. */
export interface AdminHandled {
	auditId: string;
	id: string;
	before: string;
	after: string;
	undoable: true;
	/** `needs` names the fields the caller adds to `body`: a reason of its own. */
	undo: { method: string; path: string; body: Record<string, unknown>; needs: string[] };
}

export type AdminPlan = "paid" | "comp" | "none";

/** The system, treasury and models reports share these two fields; the rest is for --json. */
export interface AdminReport {
	status: AdminStatus;
	problems: string[];
	[key: string]: unknown;
}

interface AdminRevenueSubscription {
	userId: string;
	login: string | null;
	status: string;
	currentPeriodEnd: number;
	cancelAtPeriodEnd: boolean;
	since: number;
}

/** GET /admin/revenue (convex/admin/revenueValidators.ts). The CLI prints a summary. */
export interface AdminRevenue extends AdminReport {
	windowDays: number;
	billing: { configured: boolean; testMode: boolean; dashboardUrl: string };
	subscriptions: {
		snapshotAsOf: number | null;
		figures: {
			mrrUsd: number;
			active: number;
			trialing: number;
			pastDue: number;
			cancelling: number;
			started: number;
			churned: number;
		};
		truncated: boolean;
		pastDue: AdminRevenueSubscription[];
		cancelling: AdminRevenueSubscription[];
		started: AdminRevenueSubscription[];
		churned: AdminRevenueSubscription[];
	};
	comps: {
		current: number;
		lapsed: number;
		truncated: boolean;
		rows: { login: string | null; reason: string; until: number | null; current: boolean }[];
	};
	credits: {
		topups: {
			checkoutCount: number;
			checkoutUsd: number;
			autoReloadCount: number;
			autoReloadUsd: number;
		};
		clawbacks: {
			takenUsd: number;
			returnedUsd: number;
			rows: {
				chargeId: string | null;
				login: string | null;
				takenUsd: number;
				returnedUsd: number;
				lastAt: number;
			}[];
		};
	};
	autoReloadOff: {
		byReason: { reason: string; count: number }[];
		rows: { login: string | null; reason: string; offAt: number }[];
	};
	disputes: { open: number; rows: { login: string | null; charges: number }[] };
}

/** One review round as GET /admin/reviews lists it (convex/admin/reviewValidators.ts). */
export interface AdminReviewRound {
	sessionId: string;
	login: string | null;
	repo: string | null;
	prNumber: number | null;
	prUrl: string | null;
	status: string;
	kind: string | null;
	round: number | null;
	createdAt: number;
	completedAt: number | null;
	leased: boolean;
	stuck: boolean;
	costUsd: number | null;
}

/** GET /admin/reviews. The CLI prints a summary. */
export interface AdminReviews extends AdminReport {
	windowDays: number;
	recentHours: number;
	leaseMinutes: number;
	running: { count: number; stuck: number; truncated: boolean; rows: AdminReviewRound[] };
	recent: { faults: number; completed: number; failureRate: number | null; truncated: boolean };
	failures: {
		total: number;
		truncated: boolean;
		byKind: { code: string; count: number }[];
		recentByKind: { code: string; count: number }[];
		rows: AdminReviewRound[];
	};
	publishErrors: { count: number; truncated: boolean; rows: AdminReviewRound[] };
	refusals: {
		total: number;
		accounts: number;
		truncated: boolean;
		byCode: { code: string; count: number }[];
		rows: {
			login: string | null;
			repo: string | null;
			prNumber: number;
			prUrl: string | null;
			code: string;
			createdAt: number;
		}[];
	};
	durations: {
		rounds: number;
		p50Ms: number | null;
		p95Ms: number | null;
		fallbacks: number;
		truncated: boolean;
	};
}

/** GET /admin/repos (convex/admin/repoValidators.ts). The CLI prints a summary. */
export interface AdminRepos extends AdminReport {
	counts: {
		total: number;
		truncated: boolean;
		byHealth: { health: string; count: number }[];
	};
	statusRefused: {
		count: number;
		missingPermission: number;
		truncated: boolean;
		rows: {
			repoId: string;
			repo: string;
			owner: string;
			login: string | null;
			state: "missing_permission" | "refused";
			httpStatus: number | null;
			since: number;
		}[];
	};
	installations: {
		count: number;
		truncated: boolean;
		rows: {
			installationId: number;
			owner: string;
			repoCount: number;
			repos: { repoId: string; fullName: string; health: string }[];
		}[];
	};
}

/** POST /admin/alerts/test: whether the webhook took the test message, and its audit row. */
export interface AdminAlertTest {
	delivered: boolean;
	httpStatus: number | null;
	error: string | null;
	auditId: string;
}

/** POST /admin/reviews/release. It cannot be undone, so `undo` is always null. */
export interface AdminRelease {
	auditId: string;
	sessionId: string;
	outcome: "completed" | "timed_out" | "ended";
	before: string;
	after: string;
	leaseReleased: boolean;
	followUpStarted: boolean;
	undoable: false;
	undo: null;
}

export interface AdminAuditEntry {
	id?: string;
	action: string;
	operator: string | null;
	targetType: string;
	targetId: string;
	targetLabel: string;
	reason: string;
	before: unknown;
	after: unknown;
	createdAt: number;
}

export interface AdminUserRow {
	userId: string;
	login: string | null;
	createdAt: number;
	deleting: boolean;
	plan: AdminPlan;
	creditsUsd: number;
}

export interface AdminUserList {
	users: AdminUserRow[];
	nextCursor: string | null;
}

/** The account detail; the CLI prints a summary and --json prints all of it. */
export interface AdminUserDetail {
	user: AdminUserRow;
	subscription: { status: string; currentPeriodEnd: number; cancelAtPeriodEnd: boolean } | null;
	comp: { until: number | null; current: boolean } | null;
	credits: { allowanceUsd: number; topupUsd: number; starterGranted: boolean };
	budget: {
		source: "default" | "custom" | "none";
		limitUsd: number | null;
		ownKeyUsd: number;
		platformUsd: number;
	};
	repos: { fullName: string; active: boolean; monthUsd: number }[];
	reposPartial: boolean;
	audit: (AdminAuditEntry & { undoable: boolean })[];
}

/** What every user write answers. `undo` is null on an undo. */
export interface AdminWrite {
	auditId: string;
	applied: boolean;
	before: unknown;
	after: unknown;
	undo: unknown;
}

export type MonthlyBudget = number | null | "default";

export interface AdminCreditArgs {
	login: string;
	amountUsd: number;
	requestId: string;
	reason: string;
}

export interface AdminBalanceArgs {
	provider: string;
	amountUsd: number;
	asOf?: string;
	note: string;
}

const ADMIN_TOKEN_ENV = "CODEPANEL_ADMIN_TOKEN";

/**
 * The URL and token for admin calls: CODEPANEL_ADMIN_TOKEN when set, else the
 * ordinary token (CODEPANEL_TOKEN, or the saved login). The URL resolves as
 * for every other command.
 */
export function adminConfigFromEnv(
	env: Record<string, string | undefined> = process.env,
	stored: StoredCredentials | null = null,
	now: number = Date.now(),
): ClientConfig {
	const adminToken = env[ADMIN_TOKEN_ENV]?.trim();
	if (adminToken && !TOKEN_PATTERN.test(adminToken)) {
		throw new Error(`${ADMIN_TOKEN_ENV} must be an admin API token (it starts with cpk_).`);
	}
	return configFromEnv(adminToken ? { ...env, CODEPANEL_TOKEN: adminToken } : env, stored, now);
}

export class AdminClient {
	constructor(private readonly client: CodePanelClient) {}

	static fromConfig(config: ClientConfig, signal?: AbortSignal): AdminClient {
		return new AdminClient(new CodePanelClient(config, signal));
	}

	overview = () => this.client.request<AdminOverview>("GET", "/admin/overview");
	system = () => this.client.request<AdminReport>("GET", "/admin/system");
	treasury = () => this.client.request<AdminReport>("GET", "/admin/treasury");
	models = () => this.client.request<AdminReport>("GET", "/admin/models");
	revenue = () => this.client.request<AdminRevenue>("GET", "/admin/revenue");
	reviews = () => this.client.request<AdminReviews>("GET", "/admin/reviews");
	repos = () => this.client.request<AdminRepos>("GET", "/admin/repos");
	quality = () => this.client.request<AdminQuality>("GET", "/admin/quality");
	evals = () => this.client.request<AdminEvals>("GET", "/admin/evals");
	release = (args: { sessionId: string; reason: string }) =>
		this.client.request<AdminRelease>("POST", "/admin/reviews/release", args);
	inbox = (topic?: AdminFeedbackTopic) =>
		this.client.request<AdminInbox>("GET", "/admin/inbox", { topic });
	handle = (args: { id: string; reason: string; unhandle: boolean }) =>
		this.client.request<AdminHandled>(
			"POST",
			args.unhandle ? "/admin/inbox/unhandle" : "/admin/inbox/handle",
			{ id: args.id, reason: args.reason },
		);
	audit = (limit?: number) =>
		this.client.request<{ entries: AdminAuditEntry[] }>("GET", "/admin/audit", { limit });
	users = (cursor?: string) =>
		this.client.request<AdminUserList>("GET", "/admin/users", { cursor });
	user = (login: string) =>
		this.client.request<AdminUserDetail>("GET", "/admin/users/get", { login });
	comp = (args: { login: string; until?: string; reason: string }) =>
		this.client.request<AdminWrite>("POST", "/admin/users/comp", args);
	revokeComp = (args: { login: string; reason: string }) =>
		this.client.request<AdminWrite>("POST", "/admin/users/comp/revoke", args);
	credits = (args: AdminCreditArgs) =>
		this.client.request<AdminWrite>("POST", "/admin/users/credits", { ...args });
	budget = (args: { login: string; monthlyBudgetUsd: MonthlyBudget; reason: string }) =>
		this.client.request<AdminWrite>("POST", "/admin/users/budget", args);
	undo = (args: { auditId: string; reason: string }) =>
		this.client.request<AdminWrite>("POST", "/admin/audit/undo", args);
	refreshModels = (reason: string) =>
		this.client.request<{ providers: unknown; before: unknown; after: unknown }>(
			"POST",
			"/admin/models/refresh",
			{ reason },
		);
	alertTest = (reason: string) =>
		this.client.request<AdminAlertTest>("POST", "/admin/alerts/test", { reason });
	recordBalance = (args: AdminBalanceArgs) =>
		this.client.request<{ id: string }>("POST", "/admin/treasury/balances", { ...args });
}
