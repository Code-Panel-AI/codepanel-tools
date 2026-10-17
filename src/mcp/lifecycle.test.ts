import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { exitWhenClosed } from "./lifecycle";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("stdin ending closes the server once, then exits 0", async () => {
	const stdin = new EventEmitter();
	const order: string[] = [];
	exitWhenClosed(
		stdin,
		async () => {
			order.push("close");
		},
		(code) => order.push(`exit ${code}`),
	);
	stdin.emit("end");
	stdin.emit("close");
	await tick();
	expect(order).toEqual(["close", "exit 0"]);
});

test("it exits even when closing the server fails", async () => {
	const stdin = new EventEmitter();
	const codes: number[] = [];
	exitWhenClosed(
		stdin,
		() => Promise.reject(new Error("boom")),
		(code) => codes.push(code),
	);
	stdin.emit("close");
	await tick();
	expect(codes).toEqual([0]);
});

test("the returned function removes the listeners", () => {
	const stdin = new EventEmitter();
	const stop = exitWhenClosed(
		stdin,
		async () => {},
		() => {},
	);
	stop();
	expect(stdin.listenerCount("end") + stdin.listenerCount("close")).toBe(0);
});
