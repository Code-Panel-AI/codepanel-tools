import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * A callback that sends MCP progress notifications for the running call, or
 * undefined if the client did not ask for them. Clients that reset their tool
 * timeout on progress stay patient through a long `wait_for_review`.
 */
export function progressReporter(extra: Extra): ((message: string) => void) | undefined {
	const token = extra._meta?.progressToken;
	if (token === undefined) return undefined;
	let count = 0;
	return (message) => {
		void extra
			.sendNotification({
				method: "notifications/progress",
				params: { progressToken: token, progress: ++count, message },
			})
			.catch(() => undefined);
	};
}
