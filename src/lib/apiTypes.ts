/**
 * Response types of CodePanel's /api/v1. Generated from CodePanel's backend
 * (tools/export in its private repository); do not edit by hand.
 */

/** A document id. The table name only documents what the id refers to. */
export type Id<_Table extends string> = string;

export type ApiErrorCode =
	| "invalid_input"
	| "unauthorized"
	| "forbidden"
	| "missing_scope"
	| "not_found"
	| "rate_limited"
	| "precondition"
	| "internal";

export type RoleSummary = {
	id: string;
	name: string;
	summary: string;
	tier: "balanced" | "economy" | "frontier";
	effort: "high" | "medium" | "low";
	isDefault: boolean;
};

export type Repo = {
	webhookId?: string | undefined;
	createdAt: number;
	updatedAt: number;
	githubOwner: string;
	githubName: string;
	githubFullName: string;
	githubRepoId: number;
	defaultBranch: string;
	isActive: boolean;
	settings: {
		gate?: "all" | "off" | "critical" | "warning" | undefined;
		inlineSuggestions?: boolean | undefined;
		reviewSwitches?:
			| {
					REVIEW_CACHEABLE_PROMPTS?: boolean | undefined;
					REVIEW_REVIEWER_TOOLS?: boolean | undefined;
					REVIEW_PRECISION_RULES?: boolean | undefined;
					REVIEW_CHANGED_LINES?: boolean | undefined;
			  }
			| undefined;
		triggers?:
			| {
					command?: { trigger: string } | undefined;
					drafts: { include: boolean; reviewOnReady: boolean };
					enabled: boolean;
					events: {
						onOpened: boolean;
						onSynchronize: boolean;
						onReopened: boolean;
						onCommit: boolean;
						onCommand: boolean;
					};
					branches: { matchType: "all" | "include" | "exclude"; patterns: string[] };
			  }
			| undefined;
		maxAutoRounds?: number | undefined;
		botMaxRounds?: number | undefined;
		modelOverrides?: string[] | undefined;
		panelId?: Id<"reviewPanels"> | undefined;
		agentFiles?: boolean | undefined;
		autoReview: boolean;
	};
	_id: Id<"repos">;
};

export type ConnectableRepo = {
	fullName: string;
	private: boolean;
	defaultBranch: string;
	canInstallWebhook: boolean;
};

export type Panel = {
	budgetUsd?: number | undefined;
	name: string;
	reviewers: {
		description?: string | undefined;
		reasoningEffort?: string | undefined;
		systemPrompt?: string | undefined;
		instructions?: string | undefined;
		failure?:
			| { lastFailureAt?: number | undefined; reason: string; consecutiveFailures: number }
			| undefined;
		name: string;
		provider: string;
		modelId: string;
		slug: string;
		avatar: string;
		isDefault: boolean;
		totalReviews: number;
		totalCostUsd: number;
		_id: Id<"agents">;
		providerName: string;
		callable: boolean;
		priced: boolean;
	}[];
	orchestrator: {
		description?: string | undefined;
		reasoningEffort?: string | undefined;
		systemPrompt?: string | undefined;
		instructions?: string | undefined;
		failure?:
			| { lastFailureAt?: number | undefined; reason: string; consecutiveFailures: number }
			| undefined;
		name: string;
		provider: string;
		modelId: string;
		slug: string;
		avatar: string;
		isDefault: boolean;
		totalReviews: number;
		totalCostUsd: number;
		_id: Id<"agents">;
		providerName: string;
		callable: boolean;
		priced: boolean;
	} | null;
	ready: boolean;
	isDefault: boolean;
	_id: Id<"reviewPanels">;
	budgetIsDefault: boolean;
};

export type Model = {
	displayName?: string | undefined;
	id: string;
	provider: string;
	source: "credits" | "own_key";
	providerName: string;
};

export type KeyStatus = {
	provider: string;
	name: string;
	configured: boolean;
	status: "valid" | "invalid" | null;
	lastValidatedAt: number | null;
	lastError: string | null;
	modelCount: number;
	consoleUrl: string;
};

export type ReviewSnapshot = {
	traceparent?: string | undefined;
	round?: number | undefined;
	status?: "pending" | "reviewing" | "complete" | "failed" | undefined;
	headSha?: string | undefined;
	lastReviewedSha?: string | undefined;
	reviewCommentId?: number | undefined;
	failure?:
		| {
				nextAction?: string | undefined;
				code?:
					| "credits_required"
					| "credits_exhausted"
					| "provider_key_missing"
					| "provider_key_invalid"
					| "plan_required"
					| undefined;
				error: string;
		  }
		| undefined;
	payload?:
		| {
				nextAction?:
					| {
							reason: string;
							action: "trigger" | "stop" | "fix" | "wait" | "rate" | "done";
							refs: string[];
					  }
					| undefined;
				reviewedSha?: string | null | undefined;
				prHeadSha?: string | null | undefined;
				suppressed?:
					| {
							id: Id<"findings">;
							dismissal: {
								at: number;
								by: string;
								reason:
									| "false_positive"
									| "wrong_location"
									| "not_worth_fixing"
									| "duplicate"
									| "deferred"
									| "other"
									| null;
								via: "github" | "agent" | "owner";
								withdrawnReason: string | null;
							};
							round: number;
							headSha: string;
							severity: "critical" | "warning" | "suggestion";
							file: string;
							line: number | null;
							message: string;
							ref: string | null;
					  }[]
					| undefined;
				pullRequest?:
					| {
							state: "merged" | "open" | "closed";
							closedAt: number | null;
							mergedAt: number | null;
							mergeCommitSha: string | null;
							mergedBy: string | null;
							openAtClose: { count: number; refs: string[] } | null;
					  }
					| undefined;
				disputes: {
					id: Id<"findings">;
					at: number;
					claim:
						| "false_positive"
						| "wrong_location"
						| "not_worth_fixing"
						| "duplicate"
						| "deferred"
						| "other";
					status: "pending" | "withdrawn" | "upheld" | "revised" | "closed";
					headSha: string;
					by: string;
					reason: string | null;
					ref: string | null;
					waiting: string | null;
				}[];
				findings: {
					state?: "new" | "resolved" | "open" | "dismissed" | undefined;
					source?: "reviewers" | "orchestrator" | undefined;
					lastSeenRound?: number | undefined;
					answered?: boolean | undefined;
					rated?: boolean | undefined;
					id: Id<"findings">;
					fingerprint: string;
					reviewers: string[];
					status: "new" | "open";
					models: string[];
					patch: string | null;
					suggestion: string | null;
					severity: "critical" | "warning" | "suggestion";
					confidence: "high" | "medium" | "low" | null;
					file: string;
					line: number | null;
					message: string;
					failureScenario: string | null;
					verify: string | null;
					preExisting: string | null;
					firstSeenRound: number;
					dispute: {
						at: number;
						claim:
							| "false_positive"
							| "wrong_location"
							| "not_worth_fixing"
							| "duplicate"
							| "deferred"
							| "other";
						status: "pending" | "withdrawn" | "upheld" | "revised" | "closed";
						headSha: string;
						by: string;
						reason: string | null;
						waiting: string | null;
					} | null;
					ref: string | null;
					lineSha: string;
				}[];
				authorModel: {
					model?: string | undefined;
					tool?: string | undefined;
					family: string;
					evidence: string;
				} | null;
				handoff: {
					headSha?: string | undefined;
					agent?: string | undefined;
					source: "api" | "pr-body";
				} | null;
				linkedIssues: string[];
				round: number | null;
				headSha: string | null;
				ci: { pending: string[]; failed: string[]; passed: string[]; annotations: number } | null;
				schemaVersion: number;
				inProgress: boolean;
				counts: { critical: number; warning: number; suggestion: number; open: number };
				verdict: "ready" | "blocked" | "needs-review";
				blockedBy: string[];
				verdictReason: string | null;
				nextRound: "will-run-on-push" | "cap-reached" | "disabled";
		  }
		| undefined;
	findings: {
		state?: "new" | "resolved" | "open" | "dismissed" | undefined;
		source?: "reviewers" | "orchestrator" | undefined;
		suggestion?: string | undefined;
		line?: number | undefined;
		ref?: string | undefined;
		id: Id<"findings">;
		status: "new" | "persisting" | "resolved";
		severity: "critical" | "warning" | "suggestion";
		file: string;
		message: string;
		agentNames: string[];
		answered: boolean;
	}[];
	gate: {
		status?: "posted" | "missing_permission" | "refused" | undefined;
		level: "all" | "off" | "critical" | "warning";
		blocking: boolean;
		unanswered: string[];
	};
	found: boolean;
	rounds: {
		limit?: number | undefined;
		limitReached?: boolean | undefined;
		running: boolean;
		completed: number;
		perPr: boolean;
	};
	open: { critical: number; warning: number; suggestion: number };
};

export type ReviewStatus = {
	nextAction: string | null;
	outcome: "failed" | "completed" | null;
	status:
		| "reviewing"
		| "failed"
		| "initializing"
		| "synthesizing"
		| "ready"
		| "chatting"
		| "archived"
		| null;
	headSha: string | null;
	lastReviewedSha: string | null;
	sessionId: Id<"sessions"> | null;
	error: string | null;
	errorCode:
		| "credits_required"
		| "credits_exhausted"
		| "provider_key_missing"
		| "provider_key_invalid"
		| "plan_required"
		| null;
	publishError: string | null;
	found: boolean;
	activity: string | null;
	finished: boolean;
	sessionHeadSha: string | null;
	prState: "merged" | "open" | "closed" | null;
};

export type TriggerResult = {
	lastReviewedSha: string | null;
	scheduled: boolean;
	queued: boolean;
	queuedBehind: "dispute" | "review" | null;
	knownHeadSha: string | null;
};

export type SessionSummary = {
	id: Id<"sessions">;
	status:
		| "reviewing"
		| "failed"
		| "initializing"
		| "synthesizing"
		| "ready"
		| "chatting"
		| "archived";
	repo: string | null;
	prNumber: number | null;
	prTitle: string | null;
	activity: string | null;
	error: string | null;
	errorCode:
		| "credits_required"
		| "credits_exhausted"
		| "provider_key_missing"
		| "provider_key_invalid"
		| "plan_required"
		| null;
	nextAction: string | null;
	publishError: string | null;
	createdAt: number;
	completedAt: number | null;
};

export type SessionDetail = {
	agents: {
		name: string;
		status: "pending" | "complete" | "error" | "thinking" | "typing" | "skipped";
		error: string | null;
	}[];
	id: Id<"sessions">;
	status:
		| "reviewing"
		| "failed"
		| "initializing"
		| "synthesizing"
		| "ready"
		| "chatting"
		| "archived";
	repo: string | null;
	prNumber: number | null;
	prTitle: string | null;
	activity: string | null;
	error: string | null;
	errorCode:
		| "credits_required"
		| "credits_exhausted"
		| "provider_key_missing"
		| "provider_key_invalid"
		| "plan_required"
		| null;
	nextAction: string | null;
	publishError: string | null;
	createdAt: number;
	completedAt: number | null;
};

export type FindingList = {
	found: boolean;
	findings: {
		dispute: DisputeView | null;
		dismissReason:
			| "false_positive"
			| "wrong_location"
			| "not_worth_fixing"
			| "duplicate"
			| "deferred"
			| "other"
			| null;
		status: "new" | "persisting" | "resolved";
		dismissed: boolean;
		agentNames: string[];
		id: Id<"findings">;
		ref: string | null;
		severity: "critical" | "warning" | "suggestion";
		file: string;
		line: number | null;
		message: string;
		suggestion: string | null;
		reviewers: string[];
		source: FindingSource;
		firstSeenRound: number;
		lastSeenRound: number;
		state: "new" | "resolved" | "open" | "dismissed";
		answered: boolean;
		rated: boolean;
	}[];
};

export type Knowledge = {
	markdown: string;
	repo: string;
	rules: KnowledgeRule[];
	accountRules: { name: string; rule: string }[];
	notes: {
		type: "patterns" | "architecture" | "conventions" | "custom_rules";
		content: string;
		source: "auto" | "learned" | "user";
	}[];
	verdicts: Verdict[];
	learnings: {
		prNumber?: number | undefined;
		drafted?:
			| {
					model?: string | undefined;
					at: number;
					evidence: {
						ref?: string | undefined;
						prNumber: number;
						file: string;
						by: "adjudicator" | "person";
						note: string;
						label: string;
					}[];
			  }
			| undefined;
		number: number;
		scope: string;
		createdAt: number;
		state:
			| { status: "active"; by: "agents" | "person" | "evidence"; activatedAt: number }
			| { status: "candidate"; needs: string }
			| {
					prNumber?: number | undefined;
					reason?: string | undefined;
					status: "off";
					by: "agent" | "person";
			  }
			| { status: "expired"; lastConfirmedAt: number };
		source: "api" | "dashboard" | "comment" | "drafted";
		text: string;
		ref: string;
	}[];
};

export type KnowledgeReplaced = { rules: Counts; notes: Counts };

export type Learning = {
	prNumber?: number | undefined;
	drafted?:
		| {
				model?: string | undefined;
				at: number;
				evidence: {
					ref?: string | undefined;
					prNumber: number;
					file: string;
					by: "adjudicator" | "person";
					note: string;
					label: string;
				}[];
		  }
		| undefined;
	number: number;
	scope: string;
	createdAt: number;
	state:
		| { status: "active"; by: "agents" | "person" | "evidence"; activatedAt: number }
		| { status: "candidate"; needs: string }
		| {
				prNumber?: number | undefined;
				reason?: string | undefined;
				status: "off";
				by: "agent" | "person";
		  }
		| { status: "expired"; lastConfirmedAt: number };
	source: "api" | "dashboard" | "comment" | "drafted";
	text: string;
	ref: string;
};

export type LearningAdded = { ref: string; number: number };

export type LearningRated = { target: string; outcome: "updated" | "created" };

export type Quality = {
	findings: number;
	repo: string;
	truncated: boolean;
	byModel: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	}[];
	days: number;
	unattributed: number;
	since: number;
	minSample: number;
	overall: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	};
	byRole: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	}[];
	bySeverity: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	}[];
	byConfidence: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	}[];
	bySeverityConfidence: {
		key: string;
		reported: number;
		verified: {
			interval: { high: number; low: number } | null;
			truePositives: {
				total: number;
				disputesUpheld: number;
				disputesRevised: number;
				upByPerson: number;
			};
			falsePositives: {
				total: number;
				disputesWithdrawn: number;
				downByPerson: number;
				dismissedByPerson: number;
				notWorthFixing: number;
			};
			sample: number;
			coverage: number;
			precision: number | null;
			insufficientData: boolean;
		};
		unverified: {
			addressedByCommit: number;
			resolution: {
				touched: number;
				moved: number;
				untouched: number;
				unclassified: number;
				fileRemoved: number;
				fileLeft: number;
				unrecorded: number;
			};
			upByAgents: number;
			downByAgents: number;
			unverifiableDismissals: number;
		};
	}[];
};

export type BudgetState = {
	repo?:
		| {
				status: "open" | "unlimited" | "reached" | "uncountable";
				repo: string;
				spentUsd: number | null;
				capUsd: number | null;
				review: {
					refusal: string | null;
					status: "open" | "unlimited" | "reached" | "uncountable";
					remainingUsd: number | null;
					limitedBy: "repo" | "account" | null;
				};
				heldUsd: number | null;
				remainingUsd: number | null;
		  }
		| undefined;
	month: string;
	account: {
		status: "open" | "unlimited" | "reached" | "uncountable";
		source: "none" | "default" | "custom";
		spentUsd: number | null;
		limitUsd: number | null;
		heldUsd: number | null;
		remainingUsd: number | null;
	};
	enforced: boolean;
};

export type BudgetChange = {
	before: {
		repo?:
			| {
					status: "open" | "unlimited" | "reached" | "uncountable";
					repo: string;
					spentUsd: number | null;
					capUsd: number | null;
					review: {
						refusal: string | null;
						status: "open" | "unlimited" | "reached" | "uncountable";
						remainingUsd: number | null;
						limitedBy: "repo" | "account" | null;
					};
					heldUsd: number | null;
					remainingUsd: number | null;
			  }
			| undefined;
		month: string;
		account: {
			status: "open" | "unlimited" | "reached" | "uncountable";
			source: "none" | "default" | "custom";
			spentUsd: number | null;
			limitUsd: number | null;
			heldUsd: number | null;
			remainingUsd: number | null;
		};
		enforced: boolean;
	};
	after: {
		repo?:
			| {
					status: "open" | "unlimited" | "reached" | "uncountable";
					repo: string;
					spentUsd: number | null;
					capUsd: number | null;
					review: {
						refusal: string | null;
						status: "open" | "unlimited" | "reached" | "uncountable";
						remainingUsd: number | null;
						limitedBy: "repo" | "account" | null;
					};
					heldUsd: number | null;
					remainingUsd: number | null;
			  }
			| undefined;
		month: string;
		account: {
			status: "open" | "unlimited" | "reached" | "uncountable";
			source: "none" | "default" | "custom";
			spentUsd: number | null;
			limitUsd: number | null;
			heldUsd: number | null;
			remainingUsd: number | null;
		};
		enforced: boolean;
	};
	changed: ("repo" | "account")[];
};

export type RatingResult = {
	dispute?: DisputeAnswer | undefined;
	target: string;
	outcome: RecordOutcome;
};

export type DismissDispute = DisputeAnswer;

export type ReopenResult = {
	id: Id<"findings">;
	ref: string | null;
	reopened: boolean;
	status: "new" | "persisting" | "resolved";
};

export type Question = {
	id: Id<"prQuestions">;
	status: "pending" | "failed" | "answered";
	question: string;
	ref: string | null;
	answer: string | null;
	concedes: boolean;
	error: string | null;
	model: string | null;
	createdAt: number;
	answeredAt: number | null;
};

export type ModelTier = "balanced" | "economy" | "frontier";

export type Effort = "high" | "medium" | "low";

export type DisputeView = {
	status: "pending" | "withdrawn" | "upheld" | "revised" | "closed";
	claim:
		| "false_positive"
		| "wrong_location"
		| "not_worth_fixing"
		| "duplicate"
		| "deferred"
		| "other";
	by: string;
	at: number;
	reason: string | null;
	headSha: string;
	waiting: string | null;
};

export type DisputeStatus = "pending" | "withdrawn" | "upheld" | "revised" | "closed";

export type FindingSource = "reviewers" | "orchestrator";

export type KnowledgeRule = {
	name: string;
	rule: string;
	enabled: boolean;
};

export type Verdict = {
	kind: "rejected" | "confirmed";
	by: "agent" | "person";
	prNumber: number;
	ref?: string | undefined;
	file: string;
	line?: number | undefined;
	message: string;
	reason?: string | undefined;
	note?: string | undefined;
	at: number;
};

export type VerdictKind = "rejected" | "confirmed";

export type VerdictBy = "agent" | "person";

export type Counts = { added: number; updated: number; removed: number };

export type DisputeAnswer = {
	status: "pending" | "withdrawn" | "upheld" | "revised" | "closed";
	reason?: string | undefined;
};

export type RecordOutcome = "updated" | "created";
