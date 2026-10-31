import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp, openDatabase } from "../server.js";

const sampleState = {
  categories: [{ id: "groceries", name: "Groceries", budget: 25000, classification: "Needs" }],
  transactions: [{
    id: "transaction-1",
    kind: "expense",
    amount: 1250,
    categoryId: "groceries",
    category: "Groceries",
    date: "2026-10-30",
    note: "Market",
    createdAt: 1793380000000
  }],
  monthlyBudgets: { "2026-10": { groceries: 25000 } }
};

async function createTestServer(t) {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(() => {
    database.close();
    resolve();
  })));
  return `http://127.0.0.1:${server.address().port}`;
}

test("state API starts empty and persists valid state", async (t) => {
  const baseUrl = await createTestServer(t);
  const initialResponse = await fetch(`${baseUrl}/api/state`);
  assert.deepEqual(await initialResponse.json(), { state: null });

  const saveResponse = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleState)
  });
  assert.equal(saveResponse.status, 204);

  const loadedResponse = await fetch(`${baseUrl}/api/state`);
  assert.deepEqual(await loadedResponse.json(), { state: sampleState });
});

test("state API rejects invalid category references without overwriting saved state", async (t) => {
  const baseUrl = await createTestServer(t);
  await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleState)
  });

  const invalidState = structuredClone(sampleState);
  invalidState.transactions[0].categoryId = "missing-category";
  const invalidResponse = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidState)
  });
  assert.equal(invalidResponse.status, 400);

  const loadedResponse = await fetch(`${baseUrl}/api/state`);
  assert.deepEqual(await loadedResponse.json(), { state: sampleState });
});