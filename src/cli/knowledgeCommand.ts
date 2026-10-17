/**
 * Run and print the `knowledge` commands: the one place the CLI reads a
 * Markdown file or stdin.
 */
import type { CodePanelClient, Knowledge, KnowledgeReplaced } from "../lib/client";
import { readSource } from "./input";
import type { KnowledgeCommand } from "./knowledgeArgs";

export async function executeKnowledge(
	command: KnowledgeCommand,
	client: CodePanelClient,
	signal?: AbortSignal,
): Promise<Knowledge | KnowledgeReplaced> {
	if (command.kind === "knowledge") return client.getKnowledge(command.repo);
	return client.replaceKnowledge(command.repo, await readSource(command.source, signal));
}

const counts = (c: { added: number; updated: number; removed: number }) =>
	`${c.added} added, ${c.updated} updated, ${c.removed} removed`;

export function formatKnowledge(command: KnowledgeCommand, result: unknown): string {
	if (command.kind === "knowledge") return (result as Knowledge).markdown;
	const r = result as KnowledgeReplaced;
	return `Rules: ${counts(r.rules)}.\nNotes: ${counts(r.notes)}.`;
}
