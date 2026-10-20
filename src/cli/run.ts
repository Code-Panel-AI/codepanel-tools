/**
 * Turn a parsed command into API calls, and the result into text.
 */

import { AdminClient } from "../lib/adminClient";
import type { SpendReport } from "../lib/apiTypes";
import { askAndWait } from "../lib/ask";
import type {
	CodePanelClient,
	ConnectableRepo,
	DismissResult,
	FindingList,
	HandoffResult,
	KeyStatus,
	Model,
	Panel,
	Quality,
	Question,
	RatingResult,
	ReopenResult,
	Repo,
	ReviewSnapshot,
	RoleSummary,
	RoundsResult,
	SessionDetail,
	SessionSummary,
	TriggerResult,
} from "../lib/client";
import type { WaitResult } from "../lib/wait";
import { executeAdmin, formatAdmin } from "./adminCommand";
import type { Command } from "./args";
import { handoffText } from "./handoffArgs";
import { executeKnowledge, formatKnowledge } from "./knowledgeCommand";
import { executeLearning, formatLearning } from "./learningCommand";
import { executeLocalReview, formatLocalReview, type LocalBrief } from "./localReview";
import { executePanelPlan, formatPanelPlan } from "./panelPlanCommand";
import { executeQuality, formatQuality } from "./qualityCommand";
import {
	alsoAt,
	type ExecuteOptions,
	executeReview,
	formatReview,
	formatTrigger,
	formatWait,
	loc,
} from "./reviewCommand";
import { executeSettings, formatRepoSet, formatSettings } from "./settingsCommand";
import { executeSpend, formatOptimization, formatSpendReport } from "./spendCommand";

export { exitCodeFor } from "./reviewCommand";

const MS = 1000;

/** Panel subcommands default to the user's default panel. */
async function panelIdOrDefault(client: CodePanelClient, panelId?: string): Promise<string> {
	if (panelId) return panelId;
	const panels = await client.listPanels();
	const chosen = panels.find((p) => p.isDefault) ?? panels[0];
	if (!chosen)
		throw new Error("No review panel yet. Add a provider key in Settings → Provider keys first.");
	return chosen._id;
}

export async function execute(
	command: Command,
	client: CodePanelClient,
	options: ExecuteOptions = {},
): Promise<unknown> {
	switch (command.kind) {
		case "help":
		case "login":
		case "logout":
			return null;
		case "spend":
		case "optimize":
			return executeSpend(command, client);
		case "whoami":
			return client.me();
		case "repos":
			return command.connectable ? client.listConnectableRepos() : client.listRepos();
		case "repos.connect":
			return client.connectRepo(command.repo);
		case "repos.disconnect":
			return client.disconnectRepo(command.repo);
		case "repos.set": {
			const { kind: _, ...args } = command;
			return client.updateRepoSettings(args);
		}
		case "panel":
			return client.listPanels();
		case "panel.roles":
			return client.listRoles();
		case "panel.recommend":
		case "panel.apply":
		case "panel.restore":
			return executePanelPlan(command, client);
		case "models":
			return client.listModels();
		case "panel.addReviewer": {
			const { kind: _, panelId, ...args } = command;
			return client.addReviewer({ ...args, panelId: await panelIdOrDefault(client, panelId) });
		}
		case "panel.removeReviewer":
			return client.removeReviewer({
				agentId: command.agentId,
				panelId: await panelIdOrDefault(client, command.panelId),
			});
		case "panel.updateMember": {
			const { kind: _, ...args } = command;
			return client.updateMember(args);
		}
		case "panel.orchestrator": {
			const { kind: _, panelId, ...args } = command;
			return client.setOrchestrator({ ...args, panelId: await panelIdOrDefault(client, panelId) });
		}
		case "panel.set": {
			const { kind: _, panelId, ...args } = command;
			return client.updatePanel({ ...args, panelId: await panelIdOrDefault(client, panelId) });
		}
		case "keys":
			return client.keyStatus();
		case "review":
			return executeReview(command, client, options);
		case "review.local":
			return executeLocalReview(command, client, options.git);
		case "sessions": {
			const { kind: _, ...args } = command;
			return client.listSessions(args);
		}
		case "session":
			return client.getSession(command.id);
		case "findings":
			return client.listFindings({
				repo: command.repo,
				pr: command.pr,
				includeResolved: command.all,
			});
		case "findings.dismiss":
			return client.dismissFinding({
				findingId: command.findingId,
				reason: command.reason,
				agent: command.agent ?? process.env.CODEPANEL_AGENT,
				note: command.note,
			});
		case "findings.reopen": {
			const { kind: _, ...target } = command;
			return client.reopenFinding(target);
		}
		case "knowledge":
		case "knowledge.set":
			return executeKnowledge(command, client, options.signal);
		case "learnings":
		case "learn":
		case "learning":
			return executeLearning(command, client);
		case "quality":
			return executeQuality(command, client);
		case "admin.overview":
		case "admin.report":
		case "admin.audit":
		case "admin.users":
		case "admin.user":
		case "admin.comp":
		case "admin.uncomp":
		case "admin.credit":
		case "admin.budget":
		case "admin.undo":
		case "admin.refreshModels":
		case "admin.alertTest":
		case "admin.release":
		case "admin.inbox":
		case "admin.handle":
		case "admin.balance":
			return executeAdmin(command, new AdminClient(client));
		case "budget":
		case "budget.set":
		case "repos.switches":
		case "autoReload":
		case "autoReload.set":
		case "creditsFirst":
		case "creditsFirst.set":
			return executeSettings(command, client);
		case "feedback": {
			const { kind: _, agent, ...args } = command;
			return client.rate({ ...args, agent: agent ?? process.env.CODEPANEL_AGENT });
		}
		case "handoff":
			return client.submitHandoff({
				repo: command.repo,
				pr: command.pr,
				text: await handoffText(command, options.signal),
				sha: command.sha,
				authorAgent: command.authorAgent,
				authorModel: command.authorModel,
				agent: command.agent ?? process.env.CODEPANEL_AGENT,
			});
		case "rounds":
			return client.setRounds({ repo: command.repo, pr: command.pr, rounds: command.rounds });
		case "ask": {
			const { kind: _, agent, timeoutSeconds, ...args } = command;
			return askAndWait(
				client,
				{ ...args, agent: agent ?? process.env.CODEPANEL_AGENT },
				{ signal: options.signal, timeoutMs: timeoutSeconds && timeoutSeconds * MS },
			);
		}
	}
}

const when = (ms: number | null) => (ms === null ? "—" : new Date(ms).toISOString().slice(0, 16));
function formatRepos(repos: Repo[]): string {
	if (repos.length === 0) return "No repositories connected. Try: codepanel repos --connectable";
	return repos
		.map((r) => {
			const state = r.isActive
				? r.settings.autoReview
					? "auto-review"
					: "manual"
				: "disconnected";
			const hook = r.webhookId ? "" : "  (no webhook: reconnect it)";
			const cap = r.settings.maxAutoRounds;
			const rounds = cap === undefined ? "" : `  max ${cap} auto rounds`;
			const bots = r.settings.botMaxRounds;
			const botCap = bots === undefined ? "" : `  bots up to ${bots}`;
			const back = r.settings.stepBackAfterRounds;
			const stepBack =
				back === undefined ? "" : back === 0 ? "  step back off" : `  step back from round ${back}`;
			const gate = r.settings.gate ? `  gate ${r.settings.gate}` : "";
			const inline = r.settings.inlineSuggestions ? "  inline suggestions" : "";
			return `${r.githubFullName}  ${state}${rounds}${botCap}${stepBack}${gate}${inline}${r.settings.panelId ? `  panel ${r.settings.panelId}` : ""}${hook}`;
		})
		.join("\n");
}

function formatConnectable(repos: ConnectableRepo[]): string {
	return repos
		.map(
			(r) =>
				`${r.fullName}${r.private ? "  private" : ""}${r.canInstallWebhook ? "" : "  (needs admin)"}`,
		)
		.join("\n");
}

const FAILURE_REASON_MAX_CHARS = 120;

/** A provider error is often long JSON; the listing keeps one line per member. */
function oneLine(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > FAILURE_REASON_MAX_CHARS
		? `${flat.slice(0, FAILURE_REASON_MAX_CHARS - 3)}...`
		: flat;
}

function formatPanels(panels: Panel[]): string {
	if (panels.length === 0) return "No panel yet. Add a provider key in Settings → Provider keys.";
	return panels
		.map((p) => {
			const member = (m: Panel["reviewers"][number]) =>
				`    ${m.name}  ${m.provider}/${m.modelId}  effort ${m.reasoningEffort ?? "default"}  ` +
				`${m.callable ? "" : "(key missing or broken)  "}` +
				`${m.failure ? `(failed last ${m.failure.consecutiveFailures} rounds: ${oneLine(m.failure.reason)})  ` : ""}id ${m._id}`;
			return [
				`${p.name}${p.isDefault ? " (default)" : ""}  ${p.ready ? "ready" : "NOT READY"}  id ${p._id}`,
				"  Reviewers:",
				...p.reviewers.map(member),
				`  Orchestrator:${p.orchestrator ? `\n${member(p.orchestrator)}` : " none"}`,
			].join("\n");
		})
		.join("\n\n");
}

function formatModels(models: Model[]): string {
	if (models.length === 0)
		return "No models reachable. Add a working key in Settings → Provider keys.";
	return models
		.map((m) => `${m.provider}  ${m.id}${m.displayName ? `  (${m.displayName})` : ""}`)
		.join("\n");
}

function formatRoles(roles: RoleSummary[]): string {
	return roles
		.map(
			(r) =>
				`${r.id}  ${r.name}${r.isDefault ? "  (default)" : ""}\n  ${r.summary}. ${r.tier} tier, ${r.effort} effort.`,
		)
		.join("\n");
}

function formatKeys(keys: KeyStatus[]): string {
	return keys
		.map((k) => {
			const state = !k.configured
				? "not configured"
				: k.status === "valid"
					? `ok, ${k.modelCount} models`
					: "BROKEN";
			return `${k.name.padEnd(14)} ${state}${k.lastError ? `  — ${k.lastError}` : ""}`;
		})
		.join("\n");
}

function formatFindings(list: FindingList): string {
	if (!list.found) return "No review for that pull request yet.";
	if (list.findings.length === 0) return "No findings.";
	return list.findings
		.map((f) => {
			const state = f.dismissed ? "dismissed" : f.status;
			const fix = f.suggestion ? `\n    fix: ${f.suggestion.split("\n").join("\n    ")}` : "";
			const name = f.ref ? `${f.ref} ` : "";
			return `${name}[${f.severity}] ${loc(f)} — ${f.message}  (${state}, id ${f.id})${alsoAt(f.instances ?? [])}${fix}`;
		})
		.join("\n");
}

function formatSession(s: SessionSummary): string {
	const target = s.repo ? `${s.repo}#${s.prNumber ?? "?"}` : "—";
	const why = s.error ?? s.publishError ?? s.activity;
	return `${s.id}  ${s.status.padEnd(12)} ${target}  ${when(s.createdAt)}${why ? `  ${why}` : ""}`;
}

function formatSessionDetail(s: SessionDetail): string {
	return [
		formatSession(s),
		...s.agents.map((a) => `  ${a.name}: ${a.status}${a.error ? ` — ${a.error}` : ""}`),
	].join("\n");
}

function formatQuestion(q: Question): string {
	if (q.status === "failed") return `Not answered: ${q.error ?? "unknown error"}`;
	if (q.status === "pending") {
		// The CLI has no flag for resuming a question; running `ask` again asks a new one.
		return `Still waiting for the answer (question ${q.id}); exit code 3. Rerunning codepanel ask would ask a new question. To wait for this one: raise --timeout next time, or call ask_reviewer with questionId ${q.id} over MCP, or GET /api/v1/reviews/ask?id=${q.id} with your token.`;
	}
	const withdrawn = q.concedes ? `\n\n${q.ref} is withdrawn.` : "";
	return `${q.answer ?? ""}${withdrawn}\n\n(${q.model})`;
}

export function format(command: Command, result: unknown): string {
	switch (command.kind) {
		case "help":
			return "";
		case "whoami": {
			const me = result as { githubUsername: string | null; token: string; scopes: string[] };
			return `${me.githubUsername ?? "unknown"} via token "${me.token}" (${me.scopes.join(", ")})`;
		}
		case "repos":
			return command.connectable
				? formatConnectable(result as ConnectableRepo[])
				: formatRepos(result as Repo[]);
		case "repos.connect":
			return `Connected ${(result as { fullName: string }).fullName}; webhook installed.`;
		case "panel":
			return formatPanels(result as Panel[]);
		case "panel.roles":
			return formatRoles(result as RoleSummary[]);
		case "models":
			return formatModels(result as Model[]);
		case "keys":
			return formatKeys(result as KeyStatus[]);
		case "review":
			if (command.wait) return formatWait(result as WaitResult);
			return command.trigger
				? formatTrigger(command.repo, command.pr, result as TriggerResult)
				: formatReview(result as ReviewSnapshot);
		case "review.local":
			return formatLocalReview(result as LocalBrief);
		case "sessions": {
			const sessions = result as SessionSummary[];
			return sessions.length ? sessions.map(formatSession).join("\n") : "No sessions.";
		}
		case "session":
			return formatSessionDetail(result as SessionDetail);
		case "findings":
			return formatFindings(result as FindingList);
		case "feedback": {
			const r = result as RatingResult;
			return `Rated ${r.target} ${command.rating} (${r.outcome === "created" ? "new" : "replaced your earlier rating"}).`;
		}
		case "ask":
			return formatQuestion(result as Question);
		case "findings.dismiss": {
			const { dispute } = result as DismissResult;
			return dispute ? `Disputed; the orchestrator answers it (${dispute.status}).` : "Dismissed.";
		}
		case "findings.reopen": {
			const r = result as ReopenResult;
			const name = r.ref ?? r.id;
			return r.reopened ? `Reopened ${name}.` : `${name} was not dismissed; nothing changed.`;
		}
		case "knowledge":
		case "knowledge.set":
			return formatKnowledge(command, result);
		case "learnings":
		case "learn":
		case "learning":
			return formatLearning(command, result);
		case "quality":
			return formatQuality(result as Quality);
		case "spend":
			return formatSpendReport(result as SpendReport);
		case "optimize":
			return formatOptimization(result as Parameters<typeof formatOptimization>[0]);
		case "admin.overview":
		case "admin.report":
		case "admin.audit":
		case "admin.users":
		case "admin.user":
		case "admin.comp":
		case "admin.uncomp":
		case "admin.credit":
		case "admin.budget":
		case "admin.undo":
		case "admin.refreshModels":
		case "admin.alertTest":
		case "admin.release":
		case "admin.inbox":
		case "admin.handle":
		case "admin.balance":
			return formatAdmin(command, result);
		case "budget":
		case "budget.set":
		case "repos.switches":
		case "autoReload":
		case "autoReload.set":
		case "creditsFirst":
		case "creditsFirst.set":
			return formatSettings(command, result);
		case "panel.recommend":
		case "panel.apply":
		case "panel.restore":
			return formatPanelPlan(command, result);
		case "repos.set":
			return formatRepoSet(result, command.reviewSwitches !== undefined);
		case "handoff": {
			const r = result as HandoffResult;
			const cut = r.truncated ? ", cut to fit" : "";
			return `Handoff stored (${r.chars} characters${cut}). Read by ${r.usedBy}.${r.authorshipUsedBy ? ` Authorship: ${r.authorshipUsedBy}.` : ""}`;
		}
		case "rounds": {
			const r = result as RoundsResult;
			const limit = r.limit === null ? "no limit" : `a limit of ${r.limit}`;
			const queued = r.reviewQueued ? " The current head will be reviewed if it has not been." : "";
			return `Automatic rounds: ${r.completed} done, ${limit}${r.running ? "; a round is running" : ""}.${queued}`;
		}
		case "panel.addReviewer":
		case "panel.orchestrator":
			return `Done. Reviewer id ${(result as { agentId: string }).agentId}`;
		default:
			return "Done.";
	}
}
