/**
 * Ending the server with its client. The stdio transport never notices stdin
 * closing, so a server whose client is gone (and which init has reparented)
 * would keep a `wait_for_review` polling until its timeout.
 */

const CLOSE_EVENTS = ["end", "close"] as const;

/**
 * Run `close` once, then `exit(0)`, when `input` ends or closes. `close` is
 * the server's: it fires the transport's onclose, which aborts every
 * in-flight handler's signal. Returns a function that removes the listeners.
 */
export function exitWhenClosed(
	input: NodeJS.EventEmitter,
	close: () => Promise<void>,
	exit: (code: number) => void,
): () => void {
	let closing = false;
	const onClosed = () => {
		if (closing) return;
		closing = true;
		close()
			.catch(() => undefined)
			.finally(() => exit(0));
	};
	for (const event of CLOSE_EVENTS) input.on(event, onClosed);
	return () => {
		for (const event of CLOSE_EVENTS) input.off(event, onClosed);
	};
}
