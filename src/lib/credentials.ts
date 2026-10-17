/**
 * The credentials `codepanel login` leaves behind, and how the CLI and MCP
 * server find them. A file under the user's config directory, readable only
 * by them. The environment still wins over it (see config.ts).
 */

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredCredentials {
	/** The deployment the token belongs to; it is never sent anywhere else. */
	url: string;
	token: string;
	scopes?: string[];
	/** Epoch ms, when the server said the token lapses. */
	expiresAt?: number;
	savedAt: number;
}

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/** `$CODEPANEL_CONFIG_DIR`, else `$XDG_CONFIG_HOME/codepanel`, else `~/.config/codepanel`. */
export function configDir(env: Record<string, string | undefined> = process.env): string {
	if (env.CODEPANEL_CONFIG_DIR) return env.CODEPANEL_CONFIG_DIR;
	return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "codepanel");
}

export function credentialsPath(env: Record<string, string | undefined> = process.env): string {
	return join(configDir(env), "credentials.json");
}

function isStored(value: unknown): value is StoredCredentials {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.url === "string" && typeof v.token === "string";
}

/** The saved credentials, or null if there are none or the file is unreadable. */
export async function loadCredentials(
	env: Record<string, string | undefined> = process.env,
): Promise<StoredCredentials | null> {
	try {
		const parsed: unknown = JSON.parse(await readFile(credentialsPath(env), "utf8"));
		return isStored(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Save credentials with owner-only permissions. Written to a temporary file
 * created 0600 and renamed into place, so the token is never readable by
 * others, even briefly, and a crash never leaves half a file.
 */
export async function saveCredentials(
	credentials: StoredCredentials,
	env: Record<string, string | undefined> = process.env,
): Promise<string> {
	const path = credentialsPath(env);
	await mkdir(dirname(path), { recursive: true, mode: DIR_MODE });
	// Unique per save, so two saves at once never share a temp file.
	const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temp, `${JSON.stringify(credentials, null, 2)}\n`, {
			mode: FILE_MODE,
			flag: "wx",
		});
		// The umask can narrow the mode writeFile asks for; set it exactly.
		await chmod(temp, FILE_MODE);
		await rename(temp, path);
	} catch (error) {
		// The temp file holds the token; never leave it behind.
		await rm(temp, { force: true });
		throw error;
	}
	return path;
}

/** Remove saved credentials. Returns whether there were any. */
export async function clearCredentials(
	env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
	const had = (await loadCredentials(env)) !== null;
	await rm(credentialsPath(env), { force: true });
	return had;
}
