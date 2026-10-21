import type {
	CodePanelClient,
	ConnectableRepo,
	KeyStatus,
	Model,
	Panel,
	Repo,
	RoleSummary,
} from "../lib/client";
/** Panel subcommands default to the user's default panel. */
export async function panelIdOrDefault(client: CodePanelClient, panelId?: string): Promise<string> {
	if (panelId) return panelId;
	const panels = await client.listPanels();
	const chosen = panels.find((p) => p.isDefault) ?? panels[0];
	if (!chosen)
		throw new Error("No review panel yet. Add a provider key in Settings → Provider keys first.");
	return chosen._id;
}

export function formatRepos(repos: Repo[]): string {
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

export function formatConnectable(repos: ConnectableRepo[]): string {
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

export function formatPanels(panels: Panel[]): string {
	if (panels.length === 0) return "No panel yet. Add a provider key in Settings → Provider keys.";
	return panels
		.map((p) => {
			const member = (m: Panel["reviewers"][number]) =>
				`    ${m.name}  ${m.provider}/${m.modelId}  effort ${m.reasoningEffort ?? "default"}  ` +
				`${m.callable ? "" : "(key missing or broken)  "}` +
				`${m.failure ? `(failed last ${m.failure.consecutiveFailures} rounds: ${oneLine(m.failure.reason)})  ` : ""}id ${m._id}${m.toolsSupported === false ? "  (model takes no repository tools)" : ""}`;
			return [
				`${p.name}${p.isDefault ? " (default)" : ""}  ${p.ready ? "ready" : "NOT READY"}  id ${p._id}`,
				"  Reviewers:",
				...p.reviewers.map(member),
				`  Orchestrator:${p.orchestrator ? `\n${member(p.orchestrator)}` : " none"}`,
			].join("\n");
		})
		.join("\n\n");
}

export function formatModels(models: Model[]): string {
	if (models.length === 0)
		return "No models reachable. Add a working key in Settings → Provider keys.";
	return models
		.map(
			(m) =>
				`${m.provider}  ${m.id}${m.displayName ? `  (${m.displayName})` : ""}${m.inputUsdPerMTok !== null ? "" : "  WARNING: cost unknown; spending limits block this model"}`,
		)
		.join("\n");
}

export function formatRoles(roles: RoleSummary[]): string {
	return roles
		.map(
			(r) =>
				`${r.id}  ${r.name}${r.isDefault ? "  (default)" : ""}\n  ${r.summary}. ${r.tier} tier, ${r.effort} effort.`,
		)
		.join("\n");
}

export function formatKeys(keys: KeyStatus[]): string {
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
