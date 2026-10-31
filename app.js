const STORAGE_KEY = "daybook-budget-v1";
const DEMO_SESSION_KEY = "daybook-demo-session";
const PROFILE_NAME_KEY = "daybook-profile-name";
const MAX_MONTH = "2029-12";
const DEFAULT_CATEGORIES = ["Housing", "Groceries", "Transportation", "Utilities", "Dining out", "Health", "Personal", "Other"];
const CATEGORY_COLORS = ["#78a889", "#7994a2", "#b59a69", "#819b79", "#cb896e", "#8e8ab3", "#c17e8e", "#9ba69f"];
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const shortCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialState() {
  return {
    categories: DEFAULT_CATEGORIES.map((name, index) => ({ id: `category-${index}`, name, budget: 0 })),
    transactions: [],
    monthlyBudgets: {}
  };
}

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.categories) && Array.isArray(saved.transactions)) {
      if (!saved.monthlyBudgets || typeof saved.monthlyBudgets !== "object") saved.monthlyBudgets = {};
      return saved;
    }
  } catch (error) {
    console.warn("Could not load saved budget data.", error);
  }
  return createInitialState();
}

let state = readState();
let selectedMonth = localDateString().slice(0, 7);
let currentKind = "expense";
let editingTransactionId = null;
let latestReport = null;
let toastTimer;

const monthPicker = document.querySelector("#month-picker");
const yearPicker = document.querySelector("#year-picker");
const categoryList = document.querySelector("#category-list");
const recentList = document.querySelector("#recent-list");
const activityList = document.querySelector("#activity-list");
const activityFilter = document.querySelector("#activity-filter");
const transactionDialog = document.querySelector("#transaction-dialog");
const budgetsDialog = document.querySelector("#budgets-dialog");
const transactionForm = document.querySelector("#transaction-form");
const budgetsForm = document.querySelector("#budgets-form");
const entryCategory = document.querySelector("#entry-category");
const entryDate = document.querySelector("#entry-date");
const entryAmount = document.querySelector("#entry-amount");
const transactionError = document.querySelector("#transaction-error");
const reportStart = document.querySelector("#report-start");
const reportEnd = document.querySelector("#report-end");
const reportResults = document.querySelector("#report-results");
const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const profileTrigger = document.querySelector("#profile-trigger");
const profileMenu = document.querySelector("#profile-menu");
const profileNameInput = document.querySelector("#profile-name");
const profileForm = document.querySelector("#profile-form");

function closeProfileMenu() {
  profileMenu.hidden = true;
  profileTrigger.setAttribute("aria-expanded", "false");
}

function toggleProfileMenu() {
  profileMenu.hidden = !profileMenu.hidden;
  profileTrigger.setAttribute("aria-expanded", String(!profileMenu.hidden));
  if (!profileMenu.hidden) {
    profileNameInput.value = localStorage.getItem(PROFILE_NAME_KEY) || "";
    requestAnimationFrame(() => profileNameInput.focus());
  }
}

function showApp() {
  sessionStorage.setItem(DEMO_SESSION_KEY, "active");
  loginScreen.hidden = true;
  appShell.hidden = false;
}

function showLogin() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  closeProfileMenu();
  loginForm.reset();
  loginScreen.hidden = false;
  appShell.hidden = true;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Could not save on this device. Check available storage.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function formatMoney(cents, compact = false) {
  const amount = cents / 100;
  return compact ? shortCurrency.format(amount) : currency.format(amount);
}

function monthTransactions(month = selectedMonth) {
  return state.transactions.filter((transaction) => transaction.date.startsWith(month));
}

function categoryBudgetForMonth(category, month = selectedMonth) {
  let budget = category.budget || 0;
  const overrides = state.monthlyBudgets || {};
  const months = Object.keys(overrides).filter((key) => key <= month).sort();
  months.forEach((key) => {
    if (Object.hasOwn(overrides[key] || {}, category.id)) budget = overrides[key][category.id];
  });
  return budget;
}

function monthTitle(month = selectedMonth) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function changeMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > MAX_MONTH || month < "2026-01") return;
  selectedMonth = month;
  yearPicker.value = selectedMonth.slice(0, 4);
  monthPicker.value = selectedMonth.slice(5, 7);
  setDefaultReportDates(selectedMonth);
  latestReport = null;
  render();
}

function refreshMonthLabel() {
  const title = monthTitle();
  document.querySelector("#overview-date").textContent = title.toUpperCase();
  document.querySelector("#activity-month-title").textContent = title;
  document.querySelector("#activity-subtitle").textContent = `Income and spending for ${title}.`;
}

function totalsFor(transactions) {
  return transactions.reduce((totals, transaction) => {
    totals[transaction.kind] += transaction.amount;
    return totals;
  }, { expense: 0, income: 0 });
}

function renderOverview() {
  const transactions = monthTransactions();
  const expenses = transactions.filter((transaction) => transaction.kind === "expense");
  const totals = totalsFor(transactions);
  const totalBudget = state.categories.reduce((sum, category) => sum + categoryBudgetForMonth(category), 0);
  const remaining = totalBudget - totals.expense;

  document.querySelector("#remaining-total").textContent = formatMoney(Math.max(0, remaining), true);
  document.querySelector("#spent-total").textContent = formatMoney(totals.expense, true);
  document.querySelector("#income-total").textContent = formatMoney(totals.income, true);
  document.querySelector("#remaining-note").textContent = totalBudget ? `${formatMoney(totalBudget, true)} monthly budget` : "Set category budgets to get started";
  document.querySelector("#spent-note").textContent = totalBudget && remaining < 0 ? `${formatMoney(Math.abs(remaining), true)} over total budget` : "Across all categories";

  const budgetIncomeAlert = document.querySelector("#budget-income-alert");
  const budgetIncomeAlertCopy = document.querySelector("#budget-income-alert-copy");
  const budgetIncomeAlertAction = document.querySelector("#budget-income-alert-action");
  const budgetOverIncome = totalBudget > totals.income;
  const spendingOverIncome = totals.expense > totals.income;
  if (budgetOverIncome || spendingOverIncome) {
    budgetIncomeAlert.hidden = false;
    budgetIncomeAlert.classList.remove("is-neutral");
    if (budgetOverIncome && spendingOverIncome) {
      budgetIncomeAlertCopy.textContent = `Your category budgets (${formatMoney(totalBudget)}) and spending (${formatMoney(totals.expense)}) both exceed this month's income (${formatMoney(totals.income)}).`;
    } else if (budgetOverIncome) {
      budgetIncomeAlertCopy.textContent = totals.income === 0
        ? `Your category budgets total ${formatMoney(totalBudget)}, but no income is recorded this month.`
        : `Your category budgets exceed this month's income by ${formatMoney(totalBudget - totals.income)}.`;
    } else {
      budgetIncomeAlertCopy.textContent = totals.income === 0
        ? `Your spending is ${formatMoney(totals.expense)}, but no income is recorded this month.`
        : `Your spending exceeds this month's income by ${formatMoney(totals.expense - totals.income)}.`;
    }
    const action = totals.income === 0 ? "income" : budgetOverIncome ? "budgets" : "activity";
    budgetIncomeAlertAction.textContent = action === "income" ? "Add income" : action === "budgets" ? "Review budgets" : "Review activity";
    budgetIncomeAlertAction.dataset.action = action;
  } else {
    budgetIncomeAlert.hidden = true;
  }

  const progress = totalBudget > 0 ? Math.min((totals.expense / totalBudget) * 100, 100) : 0;
  const progressBar = document.querySelector("#overall-progress");
  progressBar.style.width = `${progress}%`;
  progressBar.classList.toggle("is-over", remaining < 0);

  const spentByCategory = expenses.reduce((map, transaction) => {
    map.set(transaction.categoryId, (map.get(transaction.categoryId) || 0) + transaction.amount);
    return map;
  }, new Map());

  if (!state.categories.length) {
    categoryList.innerHTML = `<div class="empty-state"><p>Add a category and set a monthly limit to start planning.</p><button class="button button-outline" data-edit-budgets type="button">Set up budgets</button></div>`;
  } else {
    categoryList.innerHTML = state.categories.map((category, index) => {
      const spent = spentByCategory.get(category.id) || 0;
      const budget = categoryBudgetForMonth(category);
      const isOver = budget > 0 && spent > budget;
      const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
      const available = budget - spent;
      const numbers = budget > 0
        ? `<span class="category-numbers ${isOver ? "is-over" : ""}"><strong>${formatMoney(spent, true)}</strong><span> / ${formatMoney(budget, true)}</span></span>`
        : `<span class="category-numbers"><strong>${formatMoney(spent, true)}</strong><span> spent</span></span>`;
      return `<div class="category-row">
        <div class="category-row-top"><div class="category-name-wrap"><span class="category-dot" style="background:${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}" aria-hidden="true"></span><span class="category-name">${escapeHtml(category.name)}</span></div>${numbers}</div>
        ${budget > 0 ? `<div class="category-track" role="progressbar" aria-label="${escapeHtml(category.name)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"><span class="${isOver ? "is-over" : ""}" style="width:${percent}%"></span></div>${isOver ? `<div class="category-unbudgeted category-over-label">${formatMoney(Math.abs(available), true)} over budget</div>` : ""}` : `<div class="category-unbudgeted">No monthly limit set</div>`}
      </div>`;
    }).join("");
  }

  renderTransactionList(recentList, transactions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5), false);
}

function renderTransactionList(container, transactions, canDelete) {
  if (!transactions.length) {
    container.innerHTML = `<div class="empty-state"><p>No entries for ${escapeHtml(monthTitle())} yet. Add one to get started.</p><button class="button button-outline" data-open-transaction type="button">Add your first entry</button></div>`;
    return;
  }
  container.innerHTML = transactions.map((transaction) => {
    const category = transaction.kind === "income"
      ? transaction.category
      : (state.categories.find((item) => item.id === transaction.categoryId)?.name || transaction.category || "Uncategorized");
    const date = new Date(`${transaction.date}T12:00:00`);
    const label = transaction.note || category;
    return `<article class="transaction-row">
      <span class="transaction-icon ${transaction.kind}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${transaction.kind === "income" ? "M12 19V5m-6 6 6-6 6 6" : "M12 5v14m-6-6 6 6 6-6"}"/></svg></span>
      <div class="transaction-main"><p class="transaction-title">${escapeHtml(label)}</p><p class="transaction-meta">${escapeHtml(category)} · ${dateFormatter.format(date)}</p></div>
      <div class="transaction-actions"><span class="transaction-amount ${transaction.kind}">${transaction.kind === "income" ? "+" : "−"}${formatMoney(transaction.amount)}</span>${canDelete ? `<button class="transaction-action-button edit-entry" data-edit-entry="${escapeHtml(transaction.id)}" type="button" aria-label="Edit ${escapeHtml(label)}" title="Edit transaction"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/></svg></button><button class="transaction-action-button delete-entry" data-delete-entry="${escapeHtml(transaction.id)}" type="button" aria-label="Delete ${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ""}</div>
    </article>`;
  }).join("");
}

function renderActivity() {
  let transactions = monthTransactions().slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (activityFilter.value !== "all") transactions = transactions.filter((transaction) => transaction.kind === activityFilter.value);
  document.querySelector("#activity-count").textContent = `${transactions.length} ${transactions.length === 1 ? "entry" : "entries"}`;
  renderTransactionList(activityList, transactions, true);
}

function render() {
  refreshMonthLabel();
  renderOverview();
  renderActivity();
}

function setView(view) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const isActive = panel.dataset.viewPanel === view;
    panel.hidden = !isActive;
    panel.classList.toggle("is-visible", isActive);
  });
  document.querySelectorAll(".nav-link[data-view]").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function openTransaction(kind = "expense", transactionToEdit = null) {
  editingTransactionId = transactionToEdit?.id || null;
  currentKind = kind;
  transactionForm.reset();
  transactionError.textContent = "";
  document.querySelector("#transaction-title").textContent = editingTransactionId ? "Edit entry" : "Add to your month";
  transactionForm.querySelector("[type=submit]").textContent = editingTransactionId ? "Save changes" : "Save entry";
  entryDate.value = localDateString();
  document.querySelectorAll("[data-kind]").forEach((button) => {
    const selected = button.dataset.kind === kind;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderEntryCategories();
  if (transactionToEdit) {
    entryAmount.value = (transactionToEdit.amount / 100).toFixed(2);
    entryCategory.value = kind === "income" ? transactionToEdit.category : transactionToEdit.categoryId;
    entryDate.value = transactionToEdit.date;
    document.querySelector("#entry-note").value = transactionToEdit.note || "";
  }
  transactionDialog.showModal();
  requestAnimationFrame(() => entryAmount.focus());
}

function renderEntryCategories() {
  const categories = currentKind === "income"
    ? ["Paycheck", "Side income", "Refund", "Other income"].map((name) => ({ id: name, name }))
    : state.categories.map((category) => ({ id: category.id, name: category.name }));
  entryCategory.innerHTML = categories.length
    ? categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("")
    : `<option value="">Add a budget category first</option>`;
}

function openBudgets() {
  renderBudgetFields();
  document.querySelector("#budget-copy").textContent = `Budgets for ${monthTitle()} carry forward to later months until you change them.`;
  document.querySelector("#budget-error").textContent = "";
  budgetsDialog.showModal();
}

function renderBudgetFields() {
  document.querySelector("#budget-fields").innerHTML = state.categories.map((category) => {
    const categoryId = escapeHtml(category.id);
    const categoryName = escapeHtml(category.name);
    const classification = ["Needs", "Wants", "Savings"].includes(category.classification) ? category.classification : "";
    const options = ["Needs", "Wants", "Savings"].map((option) => `
      <label><input type="radio" name="classification-${categoryId}" value="${option}" data-category-classification ${classification === option ? "checked" : ""}><span>${option}</span></label>`).join("");
    return `
      <div class="budget-field-row" data-budget-category="${categoryId}">
        <div class="budget-field-top">
          <label for="budget-${categoryId}">${categoryName}</label>
          <span class="budget-input-wrap"><span aria-hidden="true">$</span><input id="budget-${categoryId}" data-budget-input="${categoryId}" type="text" inputmode="decimal" pattern="[0-9]*([.][0-9]{1,2})?" title="Use a non-negative amount with up to two decimal places." value="${(categoryBudgetForMonth(category) / 100).toFixed(2)}" aria-label="Monthly budget for ${categoryName}"></span>
        </div>
        <fieldset class="budget-classification" aria-label="Classification for ${categoryName}">
          <legend class="sr-only">Classification for ${categoryName}</legend>
          ${options}
        </fieldset>
      </div>`;
  }).join("");
}

function setDefaultReportDates(month = selectedMonth) {
  const [year, monthNumber] = month.split("-").map(Number);
  reportStart.value = `${month}-01`;
  reportEnd.value = localDateString(new Date(year, monthNumber, 0));
}

function dateRangeBudget(category, start, end) {
  let allowed = 0;
  let hasBudget = false;
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const endOfMonth = new Date(year, month, daysInMonth, 12);
    const chunkEnd = endOfMonth < last ? endOfMonth : last;
    const days = Math.floor((chunkEnd - cursor) / 86400000) + 1;
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const budget = categoryBudgetForMonth(category, monthKey);
    if (budget > 0) hasBudget = true;
    allowed += budget * days / daysInMonth;
    cursor.setDate(cursor.getDate() + days);
    cursor.setHours(12, 0, 0, 0);
  }
  return hasBudget ? Math.round(allowed) : null;
}

function renderBudgetComposition(start, end) {
  const groups = [
    { name: "Needs", amount: 0, color: "#5b9671" },
    { name: "Wants", amount: 0, color: "#7895a2" },
    { name: "Savings", amount: 0, color: "#c79557" }
  ];
  let unclassified = 0;

  state.categories.forEach((category) => {
    const amount = dateRangeBudget(category, start, end) || 0;
    const group = groups.find((item) => item.name === category.classification);
    if (group) group.amount += amount;
    else unclassified += amount;
  });

  const classifiedTotal = groups.reduce((sum, group) => sum + group.amount, 0);
  if (!classifiedTotal) {
    return `<section class="budget-composition" aria-labelledby="budget-composition-title"><div class="budget-composition-heading"><div><h3 id="budget-composition-title">Budget allocation</h3><p>Classify category budgets as needs, wants, or savings to see the breakdown.</p></div></div></section>`;
  }

  let offset = 0;
  const slices = groups.filter((group) => group.amount > 0).map((group) => {
    const endOffset = offset + group.amount / classifiedTotal * 100;
    const slice = `${group.color} ${offset}% ${endOffset}%`;
    offset = endOffset;
    return slice;
  });
  const description = groups.map((group) => `${group.name} ${((group.amount / classifiedTotal) * 100).toFixed(1)}%`).join(", ");
  const legend = groups.map((group) => {
    const percentage = (group.amount / classifiedTotal) * 100;
    return `<li class="budget-legend-item"><span class="budget-legend-swatch" style="--slice-color:${group.color}" aria-hidden="true"></span><span class="budget-legend-label">${group.name}</span><span class="budget-legend-value">${formatMoney(group.amount)} <strong>${percentage.toFixed(1)}%</strong></span></li>`;
  }).join("");
  const unclassifiedNote = unclassified > 0
    ? `<p class="budget-composition-note">${formatMoney(unclassified)} in unclassified budgets are not included in these percentages.</p>`
    : "";

  return `<section class="budget-composition" aria-labelledby="budget-composition-title"><div class="budget-composition-heading"><div><h3 id="budget-composition-title">Budget allocation</h3><p>How your classified budget is split for this date range.</p></div></div><div class="budget-composition-content"><div class="budget-pie" role="img" aria-label="Budget allocation: ${description}" style="background:conic-gradient(${slices.join(",")})"></div><ul class="budget-legend">${legend}</ul></div>${unclassifiedNote}</section>`;
}

function createReport(start, end) {
  if (!start || !end || start > end) {
    reportResults.innerHTML = `<div class="report-empty"><h2>Check your dates</h2><p>The end date needs to be the same as or later than the start date.</p></div>`;
    latestReport = null;
    return;
  }

  const filtered = state.transactions.filter((transaction) => transaction.kind === "expense" && transaction.date >= start && transaction.date <= end);
  const spentByCategory = filtered.reduce((map, transaction) => {
    map.set(transaction.categoryId, (map.get(transaction.categoryId) || 0) + transaction.amount);
    return map;
  }, new Map());
  const categories = state.categories.map((category) => ({
    id: category.id,
    name: category.name,
    spent: spentByCategory.get(category.id) || 0,
    allowed: dateRangeBudget(category, start, end)
  })).filter((category) => category.spent > 0 || category.allowed !== null);
  const totalSpent = filtered.reduce((sum, transaction) => sum + transaction.amount, 0);
  const overspent = categories.filter((category) => category.allowed !== null && category.spent > category.allowed);
  latestReport = { start, end, categories, totalSpent, overspent };
  const rangeLabel = `${dateFormatter.format(new Date(`${start}T12:00:00`))} – ${dateFormatter.format(new Date(`${end}T12:00:00`))}, ${end.slice(0, 4)}`;

  if (!categories.length) {
    reportResults.innerHTML = `<div class="report-empty"><span class="report-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5V12m5 7.5V5m5 14.5v-10m5 10V8"/></svg></span><h2>No activity in this date range</h2><p>Add expenses and category budgets to build a useful report.</p></div>`;
    return;
  }

  const rows = categories.map((category) => {
    const difference = category.allowed === null ? null : category.spent - category.allowed;
    const differenceText = difference === null
      ? "No limit"
      : difference > 0
        ? `<span class="report-over">${formatMoney(difference)} over</span>`
        : `<span class="report-under">${formatMoney(Math.abs(difference))} left</span>`;
    return `<tr><td>${escapeHtml(category.name)}</td><td>${formatMoney(category.spent)}</td><td>${category.allowed === null ? "—" : formatMoney(category.allowed)}</td><td>${differenceText}</td></tr>`;
  }).join("");
  const callout = overspent.length
    ? `<p class="report-callout"><strong>${overspent.length} ${overspent.length === 1 ? "category" : "categories"} over budget:</strong> ${overspent.map((category) => `${escapeHtml(category.name)} (${formatMoney(category.spent - category.allowed)} over)`).join(", ")}</p>`
    : `<p class="report-callout is-clear"><strong>All set.</strong> No budgeted categories went over in this date range.</p>`;

  reportResults.innerHTML = `<div class="report-summary"><div><h2>Spending by category</h2><p>${rangeLabel}</p></div><div class="report-summary-total"><strong>${formatMoney(totalSpent)}</strong><span>total expenses</span></div></div>${renderBudgetComposition(start, end)}<div class="table-scroll"><table class="report-table"><thead><tr><th>Category</th><th>Spent</th><th>Budget</th><th>Difference</th></tr></thead><tbody>${rows}</tbody></table></div>${callout}<div class="report-actions"><button class="button button-outline" id="export-report" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg><span>Export CSV</span></button></div>`;
}

function exportReport() {
  if (!latestReport) return;
  const rows = [["Category", "Spent", "Budget", "Difference", "Status"]];
  latestReport.categories.forEach((category) => {
    const difference = category.allowed === null ? "" : category.spent - category.allowed;
    const status = category.allowed === null ? "No limit" : difference > 0 ? "Over budget" : "Within budget";
    rows.push([category.name, (category.spent / 100).toFixed(2), category.allowed === null ? "" : (category.allowed / 100).toFixed(2), difference === "" ? "" : (difference / 100).toFixed(2), status]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `daybook-report-${latestReport.start}-to-${latestReport.end}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-go-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.goView)));
document.querySelectorAll("[data-open-transaction]").forEach((button) => button.addEventListener("click", () => openTransaction()));
document.querySelector("#open-transaction").addEventListener("click", () => openTransaction());
document.querySelector("#open-transaction-desktop").addEventListener("click", () => openTransaction());
document.querySelector("#open-budgets").addEventListener("click", openBudgets);
loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showApp();
});
profileTrigger.addEventListener("click", toggleProfileMenu);
document.querySelector("#close-profile-menu").addEventListener("click", closeProfileMenu);
document.querySelector("#profile-logout").addEventListener("click", showLogin);
profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem(PROFILE_NAME_KEY, profileNameInput.value.trim());
  showToast("Name saved");
});
document.addEventListener("click", (event) => {
  if (!profileMenu.hidden && !profileMenu.contains(event.target) && !profileTrigger.contains(event.target)) closeProfileMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !profileMenu.hidden) closeProfileMenu();
});
document.querySelector("#budget-income-alert-action").addEventListener("click", (event) => {
  if (event.currentTarget.dataset.action === "income") openTransaction("income");
  else if (event.currentTarget.dataset.action === "activity") setView("activity");
  else openBudgets();
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

monthPicker.value = selectedMonth.slice(5, 7);
yearPicker.value = selectedMonth.slice(0, 4);
monthPicker.addEventListener("change", () => changeMonth(`${yearPicker.value}-${monthPicker.value}`));
yearPicker.addEventListener("change", () => changeMonth(`${yearPicker.value}-${monthPicker.value}`));

document.querySelectorAll("[data-kind]").forEach((button) => button.addEventListener("click", () => {
  currentKind = button.dataset.kind;
  document.querySelectorAll("[data-kind]").forEach((item) => {
    const selected = item === button;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  renderEntryCategories();
}));

transactionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(entryAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    transactionError.textContent = "Enter an amount greater than zero.";
    entryAmount.focus();
    return;
  }
  if (currentKind === "expense" && !state.categories.some((category) => category.id === entryCategory.value)) {
    transactionError.textContent = "Add a budget category before recording an expense.";
    return;
  }
  if (!entryDate.value) {
    transactionError.textContent = "Choose a date for this entry.";
    entryDate.focus();
    return;
  }
  const category = state.categories.find((item) => item.id === entryCategory.value);
  const updatedTransaction = {
    kind: currentKind,
    amount: Math.round(amount * 100),
    categoryId: currentKind === "expense" ? category.id : null,
    category: currentKind === "income" ? entryCategory.options[entryCategory.selectedIndex].text : category.name,
    date: entryDate.value,
    note: document.querySelector("#entry-note").value.trim()
  };
  const wasEditing = Boolean(editingTransactionId);
  const existingIndex = state.transactions.findIndex((transaction) => transaction.id === editingTransactionId);
  if (editingTransactionId && existingIndex !== -1) {
    state.transactions[existingIndex] = { ...state.transactions[existingIndex], ...updatedTransaction };
  } else {
    state.transactions.push({ id: crypto.randomUUID(), ...updatedTransaction, createdAt: Date.now() });
  }
  editingTransactionId = null;
  saveState();
  render();
  transactionDialog.close();
  showToast(wasEditing ? "Entry updated" : `${currentKind === "income" ? "Income" : "Expense"} saved`);
});

document.querySelector("#budget-fields").addEventListener("focusin", (event) => {
  if (event.target.matches("[data-budget-input]")) event.target.select();
});

document.querySelector("#add-category").addEventListener("click", () => {
  const input = document.querySelector("#new-category");
  const name = input.value.trim();
  const error = document.querySelector("#budget-error");
  if (!name) {
    error.textContent = "Enter a category name.";
    input.focus();
    return;
  }
  if (state.categories.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    error.textContent = "That category already exists.";
    input.focus();
    return;
  }
  state.categories.push({ id: crypto.randomUUID(), name, budget: 0 });
  input.value = "";
  error.textContent = "";
  renderBudgetFields();
  input.focus();
});

budgetsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.querySelector("#budget-error");
  const values = [...document.querySelectorAll("[data-budget-input]")];
  for (const input of values) {
    if (!Number.isFinite(Number(input.value)) || Number(input.value) < 0) {
      error.textContent = "Budgets must be zero or a positive amount.";
      input.focus();
      return;
    }
  }
  if (!state.monthlyBudgets) state.monthlyBudgets = {};
  if (!state.monthlyBudgets[selectedMonth]) state.monthlyBudgets[selectedMonth] = {};
  values.forEach((input) => {
    const category = state.categories.find((item) => item.id === input.dataset.budgetInput);
    if (category) {
      state.monthlyBudgets[selectedMonth][category.id] = Math.round(Number(input.value) * 100);
      category.classification = input.closest(".budget-field-row").querySelector("[data-category-classification]:checked")?.value || null;
    }
  });
  saveState();
  render();
  budgetsDialog.close();
  showToast("Budgets saved");
});

categoryList.addEventListener("click", (event) => {
  if (event.target.closest("[data-edit-budgets]")) openBudgets();
});

document.querySelectorAll("#recent-list, #activity-list").forEach((container) => container.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-entry]");
  if (editButton) {
    const transaction = state.transactions.find((item) => item.id === editButton.dataset.editEntry);
    if (transaction) openTransaction(transaction.kind, transaction);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-entry]");
  if (!deleteButton) return;
  state.transactions = state.transactions.filter((transaction) => transaction.id !== deleteButton.dataset.deleteEntry);
  saveState();
  render();
  showToast("Entry deleted");
}));

activityFilter.addEventListener("change", renderActivity);
document.querySelector("#report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  createReport(reportStart.value, reportEnd.value);
});
reportResults.addEventListener("click", (event) => {
  if (event.target.closest("#export-report")) exportReport();
});

setDefaultReportDates(selectedMonth);
render();

if (sessionStorage.getItem(DEMO_SESSION_KEY) === "active") {
  appShell.hidden = false;
  loginScreen.hidden = true;
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Offline support is unavailable.", error)));
}