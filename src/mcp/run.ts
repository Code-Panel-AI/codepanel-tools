import { type CodePanelClient, CodePanelError } from "../lib/client";
import type { ToolContext, ToolDef } from "./define";

export interface ToolResult {
	[key: string]: unknown;
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

/** A tool error: the message for a reader, then the same as JSON with its code for a parser. */
export function errorResult(message: string, details: Record<string, unknown> = {}): ToolResult {
	const content: ToolResult["content"] = [{ type: "text", text: `CodePanel: ${message}` }];
	if (details.code !== undefined) {
		content.push({ type: "text", text: JSON.stringify({ error: message, ...details }) });
	}
	return { content, isError: true };
}

/**
 * Run a tool and shape the answer for the assistant. Failures come back as
 * tool errors carrying the server's message ("No working API key for openai")
 * and, when the server gave one, its stable code (missing_scope, not_found,
 * ...), so the assistant can act on them instead of seeing a protocol fault.
 */
export async function runTool(
	def: ToolDef,
	client: CodePanelClient,
	args: Record<string, unknown>,
	context?: ToolContext,
): Promise<ToolResult> {
	try {
		// The client's own requests end with the call too, not only its sleeps.
		const bound = context?.signal ? client.withSignal(context.signal) : client;
		const result = await def.run(bound, args, context);
		// Compact: the reader is a model, and indentation costs it tokens.
		return { content: [{ type: "text", text: JSON.stringify(result) }] };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const details = error instanceof CodePanelError ? { ...error.details } : {};
		return errorResult(message, details);
	}
}
