import Database from "better-sqlite3";
import express from "express";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_PATH = path.join(ROOT, ".data", "daybook.sqlite");
const PUBLIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/sw.js", "sw.js"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/icon.svg", "icon.svg"]
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateState(state) {
  if (!isRecord(state) || !Array.isArray(state.categories) || !Array.isArray(state.transactions) || !isRecord(state.monthlyBudgets)) {
    return "State must contain categories, transactions, and monthlyBudgets.";
  }

  const categoryIds = new Set();
  for (const category of state.categories) {
    if (!isRecord(category) || !isNonEmptyString(category.id, 120) || !isNonEmptyString(category.name, 28)) {
      return "Each category needs a valid id and name.";
    }
    if (categoryIds.has(category.id)) return "Category ids must be unique.";
    if (!Number.isSafeInteger(category.budget) || category.budget < 0) return "Category budgets must be non-negative integer cents.";
    if (category.classification != null && !["Needs", "Wants", "Savings"].includes(category.classification)) {
      return "Category classification is invalid.";
    }
    categoryIds.add(category.id);
  }

  const transactionIds = new Set();
  for (const transaction of state.transactions) {
    if (!isRecord(transaction) || !isNonEmptyString(transaction.id, 120) || transactionIds.has(transaction.id)) {
      return "Each transaction needs a unique id.";
    }
    if (!["expense", "income"].includes(transaction.kind)) return "Transaction kind is invalid.";
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) return "Transaction amounts must be positive integer cents.";
    if (!isValidDate(transaction.date) || !Number.isSafeInteger(transaction.createdAt) || transaction.createdAt < 0) {
      return "Transaction date or creation time is invalid.";
    }
    if (!isNonEmptyString(transaction.category, 80) || typeof (transaction.note ?? "") !== "string" || (transaction.note ?? "").length > 80) {
      return "Transaction category or note is invalid.";
    }
    if (transaction.kind === "expense" && !categoryIds.has(transaction.categoryId)) {
      return "Expense transactions must reference an existing category.";
    }
    if (transaction.kind === "income" && transaction.categoryId !== null) {
      return "Income transactions cannot reference an expense category.";
    }
    transactionIds.add(transaction.id);
  }

  for (const [month, budgets] of Object.entries(state.monthlyBudgets)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isRecord(budgets)) return "Monthly budget entries are invalid.";
    for (const [categoryId, amount] of Object.entries(budgets)) {
      if (!categoryIds.has(categoryId) || !Number.isSafeInteger(amount) || amount < 0) {
        return "Monthly budgets must reference a category and contain non-negative integer cents.";
      }
    }
  }

  return null;
}

export function openDatabase(databasePath = DATABASE_PATH) {
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return database;
}

export function createApp(database = openDatabase()) {
  const app = express();
  const readState = database.prepare("SELECT state_json FROM app_state WHERE id = 1");
  const writeState = database.prepare(`
    INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
  `);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/api/state", (_request, response) => {
    const row = readState.get();
    response.json({ state: row ? JSON.parse(row.state_json) : null });
  });
  app.put("/api/state", (request, response) => {
    const validationError = validateState(request.body);
    if (validationError) return response.status(400).json({ error: validationError });
    writeState.run(JSON.stringify(request.body));
    return response.status(204).end();
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
  app.get([...PUBLIC_FILES.keys()], (request, response, next) => {
    response.sendFile(path.join(ROOT, PUBLIC_FILES.get(request.path)), (error) => {
      if (error) next(error);
    });
  });
  app.use((error, _request, response, _next) => {
    if (response.headersSent) return;
    if (error.type === "entity.too.large") return response.status(413).json({ error: "Request body is too large." });
    if (error instanceof SyntaxError && error.status === 400) return response.status(400).json({ error: "Request body must be valid JSON." });
    console.error("Backend request failed.", error);
    return response.status(500).json({ error: "Internal server error." });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000);
  const database = openDatabase();
  createApp(database).listen(port, "127.0.0.1", () => {
    console.log(`Daybook Budget is available at http://127.0.0.1:${port}`);
  });
}