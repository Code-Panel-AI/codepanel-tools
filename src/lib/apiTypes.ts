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
	learningDraft?:
		| {
				at: number;
				outcome: "drafted" | "no_repeat_found" | "no_group" | "waiting" | "call_failed";
				eligible: number;
		  }
		| undefined;
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
		escalation?:
			| {
					triggers?: ("upheld_critical" | "round_limit" | "step_back" | "novel")[] | undefined;
					contacts: string[];
			  }
			| undefined;
		inlineSuggestions?: boolean | undefined;
		reviewSwitches?:
			| {
					REVIEW_CACHEABLE_PROMPTS?: boolean | undefined;
					REVIEW_REVIEWER_TOOLS?: boolean | undefined;
					REVIEW_PRECISION_RULES?: boolean | undefined;
					REVIEW_CHANGED_LINES?: boolean | undefined;
					REVIEW_LEARNING_ATTRIBUTION?: boolean | undefined;
					REVIEW_BASE_MERGE_SCOPE?: boolean | undefined;
					REVIEW_PROOF_GRADING?: boolean | undefined;
					REVIEW_NOVEL_ESCALATION?: boolean | undefined;
			  }
			| undefined;
		triggers?:
			| {
					command?: { trigger: string } | undefined;
					drafts: { include: boolean; reviewOnReady: boolean };
					events: {
						onOpened: boolean;
						onSynchronize: boolean;
						onReopened: boolean;
						onCommit: boolean;
						onCommand: boolean;
					};
					enabled: boolean;
					branches: { matchType: "all" | "include" | "exclude"; patterns: string[] };
			  }
			| undefined;
		maxAutoRounds?: number | undefined;
		botMaxRounds?: number | undefined;
		stepBackAfterRounds?: number | undefined;
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
	ready: boolean;
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
	isDefault: boolean;
	_id: Id<"reviewPanels">;
	budgetIsDefault: boolean;
};

export type Model = {
	inputUsdPerMTok: number | null;
	outputUsdPerMTok: number | null;
	typicalCallUsd: number | null;
	tiers: ModelTier[];
	displayName?: string | undefined;
	id: string;
	provider: string;
	source: "credits" | "own_key";
	providerName: string;
};

export type PanelRecommendation = {
	comparison?:
		| { note: string; currentUsdPerRound: number | null; estimatedReductionUsdPerPr: number | null }
		| undefined;
	budget: { changes: string[]; maxUsdPerPr: number | null; fits: boolean | null };
	nextAction: "none" | "apply";
	reviewers: {
		name: string;
		tier: "balanced" | "economy" | "frontier";
		provider: string;
		source: "credits" | "own_key";
		model: string;
		reason: string;
		role: string;
		modelId: string;
		reasoningEffort: "high" | "medium" | "low" | "none" | "xhigh" | "max";
		usdPerRound: number | null;
	}[];
	orchestrator: {
		tier: "balanced" | "economy" | "frontier";
		provider: string;
		source: "credits" | "own_key";
		model: string;
		reason: string;
		modelId: string;
		reasoningEffort: "high" | "medium" | "low" | "none" | "xhigh" | "max";
		usdPerRound: number | null;
	};
	repo: string | null;
	unchanged: boolean;
	current: {
		reviewers: {
			reasoningEffort?: string | undefined;
			name: string;
			provider: string;
			modelId: string;
		}[];
		orchestrator: {
			reasoningEffort?: string | undefined;
			name: string;
			provider: string;
			modelId: string;
		} | null;
	};
	target: { scope: "default" | "repo" | "panel"; panelId: Id<"reviewPanels"> | null; note: string };
	goal: { quality: "high" | "medium" | "low"; cost: "high" | "medium" | "low" };
	estimate: {
		note: string;
		usdPerRound: number;
		usdPerPr: number;
		roundsPerPr: number;
		basis: "repo_history" | "typical";
		sampleRounds: number;
		reviewerInputTokens: number;
		reviewerOutputTokens: number;
		orchestratorInputTokens: number;
		orchestratorOutputTokens: number;
		unpriced: string[];
	};
};

export type PanelApplied = {
	panelId: Id<"reviewPanels">;
	repo: string | null;
	recommendation: {
		comparison?:
			| {
					note: string;
					currentUsdPerRound: number | null;
					estimatedReductionUsdPerPr: number | null;
			  }
			| undefined;
		budget: { changes: string[]; maxUsdPerPr: number | null; fits: boolean | null };
		nextAction: "none" | "apply";
		reviewers: {
			name: string;
			tier: "balanced" | "economy" | "frontier";
			provider: string;
			source: "credits" | "own_key";
			model: string;
			reason: string;
			role: string;
			modelId: string;
			reasoningEffort: "high" | "medium" | "low" | "none" | "xhigh" | "max";
			usdPerRound: number | null;
		}[];
		orchestrator: {
			tier: "balanced" | "economy" | "frontier";
			provider: string;
			source: "credits" | "own_key";
			model: string;
			reason: string;
			modelId: string;
			reasoningEffort: "high" | "medium" | "low" | "none" | "xhigh" | "max";
			usdPerRound: number | null;
		};
		repo: string | null;
		unchanged: boolean;
		current: {
			reviewers: {
				reasoningEffort?: string | undefined;
				name: string;
				provider: string;
				modelId: string;
			}[];
			orchestrator: {
				reasoningEffort?: string | undefined;
				name: string;
				provider: string;
				modelId: string;
			} | null;
		};
		target: {
			scope: "default" | "repo" | "panel";
			panelId: Id<"reviewPanels"> | null;
			note: string;
		};
		goal: { quality: "high" | "medium" | "low"; cost: "high" | "medium" | "low" };
		estimate: {
			note: string;
			usdPerRound: number;
			usdPerPr: number;
			roundsPerPr: number;
			basis: "repo_history" | "typical";
			sampleRounds: number;
			reviewerInputTokens: number;
			reviewerOutputTokens: number;
			orchestratorInputTokens: number;
			orchestratorOutputTokens: number;
			unpriced: string[];
		};
	};
	undo: {
		panelId: Id<"reviewPanels">;
		orchestrator: {
			reasoningEffort?: "high" | "medium" | "low" | "none" | "xhigh" | "max" | undefined;
			provider: string;
			modelId: string;
		} | null;
		budgetUsd: number | "default" | null;
		reviewerIds: Id<"agents">[];
	};
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
					| "plan_limit"
					| undefined;
				error: string;
		  }
		| undefined;
	payload?:
		| {
				convergence?:
					| {
							rounds: number;
							firstGreen: number | null;
							roundsByTrigger: { trigger: string; rounds: number }[];
							afterGreen: {
								rounds: number;
								reBlocked: number;
								byTrigger: { trigger: string; rounds: number; reBlocked: number }[];
							};
					  }
					| null
					| undefined;
				escalation?:
					| {
							needsPerson?:
								| {
										category:
											| "security_boundary"
											| "data_loss"
											| "product_decision"
											| "irreversible_migration";
										reason: string;
										ref: string;
								  }[]
								| undefined;
							trigger: "upheld_critical" | "round_limit" | "step_back" | "novel";
							contacts: string[];
							notifiedAt: number | null;
							refs: string[];
							reason: string;
					  }
					| null
					| undefined;
				localReview?:
					| {
							fixed: number;
							verdict: "ready" | "not-ready" | null;
							claim: "author";
							headSha: string;
							dropped: number;
							agent: string | null;
							counts: { critical: number; warning: number; suggestion: number };
							total: number;
							submittedAt: number;
					  }
					| null
					| undefined;
				nextAction?:
					| {
							action: "trigger" | "fix" | "wait" | "rate" | "done" | "stop" | "escalate";
							refs: string[];
							reason: string;
					  }
					| undefined;
				stepBack?:
					| {
							action: "reconsider-approach";
							reason: string;
							rounds: number;
							basis: "first-reported-after-round-1";
							threshold: number;
							totalFindings: number;
							findingsAfterRound1: number;
							setting: "stepBackAfterRounds";
							offValue: 0;
					  }
					| null
					| undefined;
				keys?:
					| {
							reviewers: {
								paidBy: "credits" | "plan" | "own_key";
								modelId: string;
								slug: string;
								creditsSkipped: "balance" | "no_price" | "not_offered" | null;
							}[];
							orchestrator: {
								paidBy: "credits" | "plan" | "own_key";
								modelId: string;
								slug: string;
								creditsSkipped: "balance" | "no_price" | "not_offered" | null;
							};
					  }
					| null
					| undefined;
				reviewedSha?: string | null | undefined;
				prHeadSha?: string | null | undefined;
				suppressed?:
					| {
							id: Id<"findings">;
							dismissal: {
								at: number;
								reason:
									| "false_positive"
									| "wrong_location"
									| "not_worth_fixing"
									| "duplicate"
									| "deferred"
									| "other"
									| null;
								by: string;
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
							state: "merged" | "closed" | "open";
							closedAt: number | null;
							mergedAt: number | null;
							mergeCommitSha: string | null;
							mergedBy: string | null;
							openAtClose: { refs: string[]; count: number } | null;
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
					waiting: string | null;
					headSha: string;
					reason: string | null;
					by: string;
					ref: string | null;
				}[];
				findings: {
					state?: "new" | "resolved" | "dismissed" | "open" | undefined;
					source?: "reviewers" | "orchestrator" | undefined;
					instances?: { file: string; line: number | null }[] | undefined;
					lastSeenRound?: number | undefined;
					answered?: boolean | undefined;
					rated?: boolean | undefined;
					id: Id<"findings">;
					models: string[];
					fingerprint: string;
					reviewers: string[];
					status: "new" | "open";
					patch: string | null;
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
						waiting: string | null;
						headSha: string;
						reason: string | null;
						by: string;
					} | null;
					suggestion: string | null;
					severity: "critical" | "warning" | "suggestion";
					confidence: "high" | "medium" | "low" | null;
					file: string;
					line: number | null;
					message: string;
					failureScenario: string | null;
					verify: string | null;
					preExisting: string | null;
					proofGraded: string | null;
					firstSeenRound: number;
					ref: string | null;
					lineSha: string;
				}[];
				authorModel: {
					model?: string | undefined;
					tool?: string | undefined;
					family: string;
					evidence: string;
				} | null;
				authorProof: {
					rung?: number | undefined;
					source: "handoff" | "description";
					text: string;
				} | null;
				handoff: {
					headSha?: string | undefined;
					agent?: string | undefined;
					source: "api" | "pr-body";
				} | null;
				linkedIssues: string[];
				verdict: "ready" | "blocked" | "needs-review";
				round: number | null;
				headSha: string | null;
				counts: { critical: number; warning: number; suggestion: number; open: number };
				ci: { pending: string[]; failed: string[]; passed: string[]; annotations: number } | null;
				schemaVersion: number;
				inProgress: boolean;
				blockedBy: string[];
				verdictReason: string | null;
				nextRound: "will-run-on-push" | "cap-reached" | "disabled";
		  }
		| undefined;
	gate: {
		status?: "posted" | "missing_permission" | "refused" | undefined;
		unanswered: string[];
		level: "all" | "off" | "critical" | "warning";
		blocking: boolean;
	};
	findings: {
		state?: "new" | "resolved" | "dismissed" | "open" | undefined;
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
		| "ready"
		| "initializing"
		| "synthesizing"
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
		| "plan_limit"
		| null;
	publishError: string | null;
	found: boolean;
	finished: boolean;
	prState: "merged" | "closed" | "open" | null;
	activity: string | null;
	sessionHeadSha: string | null;
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
		| "ready"
		| "initializing"
		| "synthesizing"
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
		| "plan_limit"
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
		| "ready"
		| "initializing"
		| "synthesizing"
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
		| "plan_limit"
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
		state: "new" | "resolved" | "dismissed" | "open";
		answered: boolean;
		rated: boolean;
		instances: { file: string; line: number | null }[];
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
		hits?: { lastPrNumber?: number | undefined; count: number; lastAt: number } | undefined;
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
		prNumber?: number | undefined;
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
		source: "api" | "dashboard" | "drafted" | "comment";
		text: string;
		ref: string;
	}[];
};

export type KnowledgeReplaced = { rules: Counts; notes: Counts };

export type Learning = {
	hits?: { lastPrNumber?: number | undefined; count: number; lastAt: number } | undefined;
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
	prNumber?: number | undefined;
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
	source: "api" | "dashboard" | "drafted" | "comment";
	text: string;
	ref: string;
};

export type LearningAdded = { ref: string; number: number };

export type LearningRated = { target: string; outcome: "created" | "updated" };

export type ReviewBrief = {
	repo: string;
	gateLevel: "all" | "off" | "critical" | "warning";
	paths: { used: string[]; dropped: number; refused: number; max: number };
	seats: BriefSeat[];
	learnings: BriefLearning[];
	droppedLearnings: string[];
	chars: number;
	text: string;
};

export type LocalReviewStored = {
	headSha: string;
	atHead: boolean | null;
	counts: { critical: number; warning: number; suggestion: number };
	total: number;
	fixed: number;
	dropped: number;
	edited: number;
} & { ok: true; shownOn: string };

export type Quality = {
	findings: number;
	since: number;
	days: number;
	unattributed: number;
	truncated: boolean;
	overall: {
		key: string;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
	repo: string;
	byModel: {
		key: string;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
	minSample: number;
	byRole: {
		key: string;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
			precision: number | null;
			coverage: number;
			insufficientData: boolean;
		};
		reported: number;
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
} & {
	convergence: {
		pullRequests: number;
		since: number;
		days: number;
		truncated: boolean;
		overall: {
			pullRequests: number;
			key: string;
			rounds: { empty: number; mean: number | null; p90: number | null; fiveOrMore: number | null };
			insufficientData: boolean;
			firstGreen: { never: number; afterRound1: number | null; meanRounds: number | null };
			afterGreen: {
				rounds: number;
				reBlocked: number;
				byTrigger: { trigger: string; rounds: number; reBlocked: number }[];
				shareOfRounds: number | null;
				reBlockedShare: number | null;
			};
			findingsByRound: {
				findings: number;
				round: string;
				critical: number;
				warning: number;
				suggestion: number;
			}[];
		};
		repo: string;
		minPullRequests: number;
		byPipeline: {
			pullRequests: number;
			key: string;
			rounds: { empty: number; mean: number | null; p90: number | null; fiveOrMore: number | null };
			insufficientData: boolean;
			firstGreen: { never: number; afterRound1: number | null; meanRounds: number | null };
			afterGreen: {
				rounds: number;
				reBlocked: number;
				byTrigger: { trigger: string; rounds: number; reBlocked: number }[];
				shareOfRounds: number | null;
				reBlockedShare: number | null;
			};
			findingsByRound: {
				findings: number;
				round: string;
				critical: number;
				warning: number;
				suggestion: number;
			}[];
		}[];
	} & {
		loop?:
			| {
					pullRequests: number;
					truncated: boolean;
					overall: {
						served: number;
						clients: { served: number; client: string; pluginVersion: string | null }[];
						pullRequests: number;
						key: string;
						rounds: number;
						insufficientData: boolean;
						pushes: number;
						pushesPerRound: number | null;
						bytesServed: number;
						bytesServedPerRound: number | null;
						toolCalls: number;
						toolCallsPerRound: number | null;
						afterServed: {
							served: number;
							action: string;
							next: {
								push: number;
								trigger: number;
								rating: number;
								dispute: number;
								none: number;
							};
						}[];
					};
					excluded: number;
					byGuidance: {
						served: number;
						clients: { served: number; client: string; pluginVersion: string | null }[];
						pullRequests: number;
						key: string;
						rounds: number;
						insufficientData: boolean;
						pushes: number;
						pushesPerRound: number | null;
						bytesServed: number;
						bytesServedPerRound: number | null;
						toolCalls: number;
						toolCallsPerRound: number | null;
						afterServed: {
							served: number;
							action: string;
							next: {
								push: number;
								trigger: number;
								rating: number;
								dispute: number;
								none: number;
							};
						}[];
					}[];
			  }
			| undefined;
	};
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
					limitedBy: "account" | "repo" | null;
				};
				remainingUsd: number | null;
				heldUsd: number | null;
		  }
		| undefined;
	account: {
		status: "open" | "unlimited" | "reached" | "uncountable";
		source: "none" | "default" | "custom";
		spentUsd: number | null;
		limitUsd: number | null;
		remainingUsd: number | null;
		heldUsd: number | null;
	};
	month: string;
	enforced: true;
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
						limitedBy: "account" | "repo" | null;
					};
					remainingUsd: number | null;
					heldUsd: number | null;
			  }
			| undefined;
		account: {
			status: "open" | "unlimited" | "reached" | "uncountable";
			source: "none" | "default" | "custom";
			spentUsd: number | null;
			limitUsd: number | null;
			remainingUsd: number | null;
			heldUsd: number | null;
		};
		month: string;
		enforced: true;
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
						limitedBy: "account" | "repo" | null;
					};
					remainingUsd: number | null;
					heldUsd: number | null;
			  }
			| undefined;
		account: {
			status: "open" | "unlimited" | "reached" | "uncountable";
			source: "none" | "default" | "custom";
			spentUsd: number | null;
			limitUsd: number | null;
			remainingUsd: number | null;
			heldUsd: number | null;
		};
		month: string;
		enforced: true;
	};
	changed: ("account" | "repo")[];
};

export type AutoReload = {
	status: "off" | "pending" | "capped" | "on" | "turned_off";
	enabled: boolean;
	message: string | null;
	month: string;
	thresholdUsd: number;
	packUsd: number;
	monthlyCapUsd: number;
	pendingSince: number | null;
	retryAfter: number | null;
	lastReloadAt: number | null;
	capReachedAt: number | null;
	offReason:
		| "card_declined"
		| "authentication_required"
		| "no_payment_method"
		| "payment_failed"
		| "disputed"
		| "stalled"
		| "billing_error"
		| null;
	offAt: number | null;
	feeFreeUsd: number;
	chargeUsd: number;
	reloadedUsd: number;
	disputeOpen: boolean;
	packOptionsUsd: number[];
};

export type AutoReloadChange = {
	before: {
		status: "off" | "pending" | "capped" | "on" | "turned_off";
		enabled: boolean;
		message: string | null;
		month: string;
		thresholdUsd: number;
		packUsd: number;
		monthlyCapUsd: number;
		pendingSince: number | null;
		retryAfter: number | null;
		lastReloadAt: number | null;
		capReachedAt: number | null;
		offReason:
			| "card_declined"
			| "authentication_required"
			| "no_payment_method"
			| "payment_failed"
			| "disputed"
			| "stalled"
			| "billing_error"
			| null;
		offAt: number | null;
		feeFreeUsd: number;
		chargeUsd: number;
		reloadedUsd: number;
		disputeOpen: boolean;
		packOptionsUsd: number[];
	};
	after: {
		status: "off" | "pending" | "capped" | "on" | "turned_off";
		enabled: boolean;
		message: string | null;
		month: string;
		thresholdUsd: number;
		packUsd: number;
		monthlyCapUsd: number;
		pendingSince: number | null;
		retryAfter: number | null;
		lastReloadAt: number | null;
		capReachedAt: number | null;
		offReason:
			| "card_declined"
			| "authentication_required"
			| "no_payment_method"
			| "payment_failed"
			| "disputed"
			| "stalled"
			| "billing_error"
			| null;
		offAt: number | null;
		feeFreeUsd: number;
		chargeUsd: number;
		reloadedUsd: number;
		disputeOpen: boolean;
		packOptionsUsd: number[];
	};
};

export type AutoReloadUpdate = {
	enabled?: boolean | undefined;
	thresholdUsd?: number | undefined;
	packUsd?: number | undefined;
	monthlyCapUsd?: number | undefined;
};

export type CreditsFirst = { creditsFirst: boolean; source: "default" | "set" };

export type CreditsFirstChange = {
	before: { creditsFirst: boolean; source: "default" | "set" };
	after: { creditsFirst: boolean; source: "default" | "set" };
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

export type SpendReport = {
	suggestions: { id: string; title: string; action: string; evidence: string }[];
	repo: string;
	month: string;
	totalUsd: number;
	ownKeyUsd: number;
	creditsUsd: number;
	calls: number;
	unpricedCalls: number;
	itemizedCalls: number;
	complete: boolean;
	groupLimitReached: boolean;
	byModel: ModelCalls[];
	nextAction: string;
};

export type RepoAuthorship = {
	limit: number;
	sampledRounds: number;
	unknownAuthorRounds: number;
	stampedRounds: number;
	singleProviderRounds: number;
	sameAuthorFamilyRounds: number;
	authors: { family: string; rounds: number }[];
	latestAuthor: {
		model?: string | undefined;
		tool?: string | undefined;
		family: string;
		evidence: string;
	} | null;
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

export type BriefSeat = {
	name: string;
	prompt: string | null;
	uiOnly: boolean;
};

export type BriefLearning = {
	ref: string;
	scope: string;
	text: string;
};

export type DisputeAnswer = {
	status: "pending" | "withdrawn" | "upheld" | "revised" | "closed";
	reason?: string | undefined;
};

export type RecordOutcome = "created" | "updated";

export type ModelCalls = {
	role: "chat" | "reviewer" | "orchestrator";
	provider: string;
	modelId: string;
	usd: number;
	calls: number;
	failedCalls: number;
};

export type CallRole = "chat" | "reviewer" | "orchestrator";
