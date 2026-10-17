import { expect, test } from "bun:test";
import { type AskClient, askAndWait } from "./ask";
import type { Question } from "./client";

const pending: Question = {
	id: "q1" as Question["id"],
	status: "pending",
	question: "why?",
	ref: "F3",
	answer: null,
	concedes: false,
	error: null,
	model: null,
	createdAt: 1,
	answeredAt: null,
};

function fakeClient(polls: Question[]): AskClient & { gets: number } {
	const client = {
		gets: 0,
		ask: async () => pending,
		getQuestion: async () => {
			client.gets++;
			return polls.shift() ?? pending;
		},
	};
	return client;
}

const instant = { sleep: async () => {} };

test("polls a pending question until it is answered", async () => {
	const answered = { ...pending, status: "answered" as const, answer: "Because." };
	const client = fakeClient([pending, answered]);
	expect(await askAndWait(client, { repo: "a/b", pr: 1, question: "why?" }, instant)).toEqual(
		answered,
	);
	expect(client.gets).toBe(2);
});

test("waiting on a pending question's id asks nothing new", async () => {
	const answered = { ...pending, status: "answered" as const, answer: "Because." };
	let asked = 0;
	const client = {
		ask: async () => {
			asked++;
			return pending;
		},
		getQuestion: async () => answered,
	};
	expect(await askAndWait(client, { questionId: "q1" }, instant)).toEqual(answered);
	expect(asked).toBe(0);
});

test("returns it still pending when time runs out, or at once without wait", async () => {
	let clock = 0;
	const slow = fakeClient([]);
	const result = await askAndWait(
		slow,
		{ repo: "a/b", pr: 1, question: "why?" },
		{
			timeoutMs: 10_000,
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
		},
	);
	expect(result.status).toBe("pending");
	const once = fakeClient([]);
	await askAndWait(once, { repo: "a/b", pr: 1, question: "why?", wait: false }, instant);
	expect(once.gets).toBe(0);
});
