/**
 * Where the CLI reads text it is given as a file or on stdin: the handoff and
 * the knowledge file. Both stop at once when the signal aborts, so Ctrl-C
 * ends a read that is waiting on a terminal or an open pipe.
 */
import { readFile } from "node:fs/promises";
import { STDIN_SOURCE } from "./knowledgeArgs";

/** What a read failure is called in "Could not read <path>: <reason>". */
const READ_FAILURES: Record<string, string> = {
	ENOENT: "no such file",
	EISDIR: "it is a directory",
	EACCES: "permission denied",
};

/** Stdin to its end as text; rejects with the signal's reason if it aborts first. */
export function readStdin(
	signal?: AbortSignal,
	stream: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const chunks: Buffer[] = [];
		const onData = (chunk: Buffer | string) => chunks.push(Buffer.from(chunk));
		const finish = (settle: () => void) => {
			stream.off("data", onData);
			stream.off("end", onEnd);
			stream.off("error", onError);
			signal?.removeEventListener("abort", onAbort);
			settle();
		};
		function onEnd() {
			finish(() => resolve(Buffer.concat(chunks).toString("utf8")));
		}
		function onError(error: Error) {
			finish(() => reject(error));
		}
		function onAbort() {
			// Paused, so the open stream no longer holds the process up.
			stream.pause();
			finish(() => reject(signal?.reason));
		}
		stream.on("data", onData);
		stream.on("end", onEnd);
		stream.on("error", onError);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/** A file's text, or an error that names the path in words instead of an errno. */
export async function readTextFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		const reason = (code && READ_FAILURES[code]) ?? (code ? code.toLowerCase() : "unreadable");
		throw new Error(`Could not read ${path}: ${reason}`, { cause: error });
	}
}

/** The text of a `--file` or knowledge source: stdin for "-", else the file. */
export function readSource(source: string, signal?: AbortSignal): Promise<string> {
	return source === STDIN_SOURCE ? readStdin(signal) : readTextFile(source);
}
