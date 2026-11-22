// Core logic functions avoid touching DOM so they can be tested directly in Node.

function splitAmount(amount, count) {
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function computeNetAmount(subtotal, taxPercent = 0, discount = 0) {
  const safeSub = Math.max(0, Math.round(Number(subtotal) || 0));
  const safeTax = Math.max(0, Number(taxPercent) || 0);
  const safeDisc = Math.max(0, Math.round(Number(discount) || 0));
  return Math.max(0, Math.round(safeSub * (1 + safeTax / 100)) - safeDisc);
}

// Legacy expenses saved before weighted splits omit `weights` and default every share weight to 1.
function expenseWeight(expense, id) {
  if (!expense.weights) return 1;
  const raw = Object.hasOwn(expense.weights, id) ? expense.weights[id] : undefined;
  if (raw === undefined) return 1;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function expenseEntries(expense, validIds) {
  return expense.splitIds
    .filter((id) => validIds.has(id))
    .map((id) => ({ id, weight: expenseWeight(expense, id) }));
}

// Distribute amount proportionally by weight using largest-remainder rounding so shares sum exactly to amount.
function splitWeighted(amount, entries) {
  const weights = entries.map((e) =>
    typeof e.weight === "number" && Number.isFinite(e.weight) && e.weight > 0
      ? e.weight
      : 0
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (entries.length === 0 || totalWeight <= 0) return entries.map(() => 0);
  const exact = weights.map((w) => (amount * w) / totalWeight);
  const shares = exact.map((x) => Math.floor(x));
  let remainder = amount - shares.reduce((sum, s) => sum + s, 0);
  const order = entries
    .map((_, i) => i)
    .toSorted((a, b) => {
      const fracDiff = exact[b] - shares[b] - (exact[a] - shares[a]);
      return fracDiff !== 0 ? fracDiff : a - b;
    });
  for (let k = 0; remainder > 0; k += 1) {
    shares[order[k % order.length]] += 1;
    remainder -= 1;
  }
  return shares;
}

function formatWeight(weight) {
  return String(weight).replace(".", ",");
}

function describeSplit(expense, nameOf) {
  const weighted = expense.splitIds.some((id) => expenseWeight(expense, id) !== 1);
  return expense.splitIds
    .map((id) =>
      weighted
        ? `${nameOf(id)} (porsi ${formatWeight(expenseWeight(expense, id))})`
        : nameOf(id)
    )
    .join(", ");
}

function computeBalances(people, expenses) {
  const balances = {};
  for (const person of people) balances[person.id] = 0;
  const validIds = new Set(people.map((p) => p.id));

  for (const expense of expenses) {
    if (!Object.hasOwn(balances, expense.payerId)) continue;
    balances[expense.payerId] += expense.amount;

    const entries = expenseEntries(expense, validIds);
    if (entries.length === 0) continue;
    const shares = splitWeighted(expense.amount, entries);
    entries.forEach((entry, i) => {
      balances[entry.id] -= shares[i];
    });
  }
  return balances;
}

function computeDetails(people, expenses) {
  const details = {};
  for (const person of people) {
    details[person.id] = { id: person.id, name: person.name, paid: 0, share: 0, balance: 0 };
  }

  const validIds = new Set(people.map((p) => p.id));
  for (const expense of expenses) {
    if (!Object.hasOwn(details, expense.payerId)) continue;
    details[expense.payerId].paid += expense.amount;

    const entries = expenseEntries(expense, validIds);
    if (entries.length === 0) continue;
    const shares = splitWeighted(expense.amount, entries);
    entries.forEach((entry, i) => {
      details[entry.id].share += shares[i];
    });
  }
  for (const person of people) {
    details[person.id].balance = details[person.id].paid - details[person.id].share;
  }
  return details;
}

function computeSettlements(people, balances) {
  const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
  const debtors = people
    .filter((p) => balances[p.id] < 0)
    .map((p) => ({ id: p.id, amount: -balances[p.id] }))
    .toSorted((a, b) => b.amount - a.amount);
  const creditors = people
    .filter((p) => balances[p.id] > 0)
    .map((p) => ({ id: p.id, amount: balances[p.id] }))
    .toSorted((a, b) => b.amount - a.amount);

  const settlements = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const pay = Math.min(debtors[d].amount, creditors[c].amount);
    if (pay > 0) {
      settlements.push({
        fromId: debtors[d].id,
        toId: creditors[c].id,
        from: nameOf(debtors[d].id),
        to: nameOf(creditors[c].id),
        amount: pay,
      });
    }
    debtors[d].amount -= pay;
    creditors[c].amount -= pay;
    if (debtors[d].amount === 0) d += 1;
    if (creditors[c].amount === 0) c += 1;
  }
  return settlements;
}

function settlementKey(settlement) {
  return `${settlement.fromId}->${settlement.toId}:${settlement.amount}`;
}

function groupThousands(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseAmountInput(text) {
  const digits = String(text).replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function sanitizePeopleList(raw) {
  if (!Array.isArray(raw)) return null;
  const seenIds = new Set();
  const clean = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = Number(item.id);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!Number.isFinite(id) || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    clean.push({ id, name });
  }
  return clean;
}

function sanitizeExpensesList(raw) {
  if (!Array.isArray(raw)) return null;
  const clean = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = Number(item.id);
    const desc = typeof item.desc === "string" ? item.desc.trim() : "";
    const amount = Number(item.amount);
    const payerId = Number(item.payerId);
    if (
      !Number.isFinite(id) ||
      !desc ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(payerId) ||
      !Array.isArray(item.splitIds)
    ) {
      continue;
    }
    const splitIds = item.splitIds.map(Number).filter(Number.isFinite);
    if (splitIds.length === 0) continue;

    let weights;
    if (item.weights && typeof item.weights === "object" && !Array.isArray(item.weights)) {
      weights = {};
      for (const [k, v] of Object.entries(item.weights)) {
        const w = Number(v);
        if (Number.isFinite(w) && w >= 0) weights[k] = w;
      }
    }

    const subtotalRaw = Number(item.subtotal);
    const taxRaw = Number(item.taxPercent);
    const discountRaw = Number(item.discount);
    const entry = {
      id,
      desc,
      amount: Math.round(amount),
      payerId,
      splitIds,
    };
    if (weights) entry.weights = weights;
    if (Number.isFinite(subtotalRaw) && subtotalRaw > 0) entry.subtotal = Math.round(subtotalRaw);
    if (Number.isFinite(taxRaw) && taxRaw > 0) entry.taxPercent = taxRaw;
    if (Number.isFinite(discountRaw) && discountRaw > 0) entry.discount = Math.round(discountRaw);
    clean.push(entry);
  }
  return clean;
}

function sanitizeSettledKeys(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => typeof item === "string" && item.includes("->"));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeSharePayload(state) {
  const payload = {
    app: "split-bill-kelompok",
    v: 1,
    title: typeof state.title === "string" ? state.title.trim() : "",
    people: state.people || [],
    expenses: state.expenses || [],
    settled: state.settled || [],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return bytesToBase64Url(bytes);
}

function decodeSharePayload(encoded) {
  if (typeof encoded !== "string" || !encoded.trim()) {
    throw new Error("Tautan nota kosong.");
  }
  const bytes = base64UrlToBytes(encoded.trim());
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || parsed.app !== "split-bill-kelompok") {
    throw new Error("Format tautan nota tidak dikenali.");
  }
  const people = sanitizePeopleList(parsed.people);
  const expenses = sanitizeExpensesList(parsed.expenses);
  if (people === null || expenses === null) {
    throw new Error("Isi peserta atau pengeluaran pada tautan tidak valid.");
  }
  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    people,
    expenses,
    settled: sanitizeSettledKeys(parsed.settled),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    splitAmount,
    computeNetAmount,
    splitWeighted,
    expenseWeight,
    expenseEntries,
    formatWeight,
    describeSplit,
    computeBalances,
    computeSettlements,
    computeDetails,
    settlementKey,
    groupThousands,
    parseAmountInput,
    sanitizePeopleList,
    sanitizeExpensesList,
    encodeSharePayload,
    decodeSharePayload,
  };
}

if (typeof document !== "undefined") {
  const PEOPLE_KEY = "sb_people";
  const EXPENSES_KEY = "sb_expenses";
  const TITLE_KEY = "sb_title";
  const SETTLED_KEY = "sb_settled";

  let idCounter = 0;
  function generateId() {
    idCounter += 1;
    return Date.now() * 1000 + (idCounter % 1000);
  }

  const el = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp" + groupThousands(Math.round(n));

  function announce(message) {
    const region = el("liveAnnouncer");
    if (!region) return;
    region.textContent = "";
    setTimeout(() => {
      region.textContent = message;
    }, 50);
  }

  function loadStoredState() {
    let corrupted = false;
    let people = [];
    let expenses = [];
    let title = "";
    let settled = new Set();

    try {
      const rawPeople = localStorage.getItem(PEOPLE_KEY);
      if (rawPeople !== null) {
        const parsed = sanitizePeopleList(JSON.parse(rawPeople));
        if (parsed === null) corrupted = true;
        else people = parsed;
      }
      const rawExpenses = localStorage.getItem(EXPENSES_KEY);
      if (rawExpenses !== null) {
        const parsed = sanitizeExpensesList(JSON.parse(rawExpenses));
        if (parsed === null) corrupted = true;
        else expenses = parsed;
      }
      title = localStorage.getItem(TITLE_KEY) || "";
      const rawSettled = localStorage.getItem(SETTLED_KEY);
      if (rawSettled !== null) {
        settled = new Set(sanitizeSettledKeys(JSON.parse(rawSettled)));
      }
    } catch {
      corrupted = true;
    }

    return { people, expenses, title, settled, corrupted };
  }

  const initial = loadStoredState();
  let people = initial.people;
  let expenses = initial.expenses;
  let billTitle = initial.title;
  let settledKeys = initial.settled;
  let dataCorrupted = initial.corrupted;

  // Store checkbox/weight choices in JS state so re-renders preserve in-progress form entries.
  let splitChecked = new Set(people.map((p) => p.id));
  let splitWeights = new Map();
  const weightOf = (id) => (splitWeights.has(id) ? splitWeights.get(id) : 1);
  let editingId = null;
  let splitCheckedBeforeEdit = null;
  let splitWeightsBeforeEdit = null;

  function setStatus(message, isError = false) {
    const statusEl = el("copyStatus");
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  }

  function save() {
    try {
      localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
      localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
      localStorage.setItem(TITLE_KEY, billTitle);
      localStorage.setItem(SETTLED_KEY, JSON.stringify([...settledKeys]));
      if (dataCorrupted) {
        dataCorrupted = false;
        el("dataWarning").hidden = true;
      }
      return true;
    } catch {
      el("dataWarningText").textContent =
        "Gagal menyimpan data ke penyimpanan browser. Periksa kuota atau izin situs.";
      el("dataWarning").hidden = false;
      return false;
    }
  }

  function askConfirm({ title, message, confirmLabel = "Ya, lanjutkan", dangerous = false }) {
    const dialog = el("confirmDialog");
    if (!dialog || typeof dialog.showModal !== "function") {
      return Promise.resolve(window.confirm(message));
    }
    el("confirmTitle").textContent = title;
    el("confirmMessage").textContent = message;
    const okBtn = el("confirmOkBtn");
    okBtn.textContent = confirmLabel;
    okBtn.className = dangerous ? "btn-danger" : "";
    const { promise, resolve } = Promise.withResolvers();
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true }
    );
    dialog.showModal();
    return promise;
  }

  function setFieldError(input, errorEl, message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      if (input) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", errorEl.id);
      }
    } else {
      errorEl.textContent = "";
      errorEl.hidden = true;
      if (input) {
        input.setAttribute("aria-invalid", "false");
        input.removeAttribute("aria-describedby");
      }
    }
  }

  function updateNetPreview() {
    const preview = el("expenseNetPreview");
    const subtotal = parseAmountInput(el("expenseAmount").value);
    const taxPercent = Math.max(0, Number(el("expenseTax").value) || 0);
    const discount = parseAmountInput(el("expenseDiscount").value);
    if (subtotal > 0 && (taxPercent > 0 || discount > 0)) {
      const net = computeNetAmount(subtotal, taxPercent, discount);
      preview.textContent = `Total akhir setelah penyesuaian: ${rupiah(net)}`;
      preview.hidden = false;
    } else {
      preview.textContent = "";
      preview.hidden = true;
    }
  }

  function exitEditMode() {
    editingId = null;
    splitCheckedBeforeEdit = null;
    splitWeightsBeforeEdit = null;
    el("expenseSubmit").textContent = "Tambah pengeluaran";
    el("expenseCancel").hidden = true;
    setFieldError(null, el("expenseError"), "");
    ["expenseDesc", "expenseAmount", "expensePayer"].forEach((id) => {
      el(id).setAttribute("aria-invalid", "false");
      el(id).removeAttribute("aria-describedby");
    });
  }

  function render() {
    el("dataWarning").hidden = !dataCorrupted;
    el("billTitle").value = billTitle;
    el("printBillTitle").textContent = billTitle.trim() ? `Nota: ${billTitle.trim()}` : "";

    const personList = el("personList");
    el("personEmpty").style.display = people.length ? "none" : "block";
    const personItems = people.map((person) => {
      const li = document.createElement("li");
      li.className = "chip";
      const span = document.createElement("span");
      span.textContent = person.name;
      const del = document.createElement("button");
      del.type = "button";
      del.setAttribute("aria-label", `Hapus peserta ${person.name}`);
      const xIcon = document.createElement("span");
      xIcon.setAttribute("aria-hidden", "true");
      xIcon.textContent = "✕";
      del.appendChild(xIcon);

      del.addEventListener("click", async () => {
        const affected = expenses.filter(
          (e) => e.payerId === person.id || e.splitIds.includes(person.id)
        ).length;
        const detail =
          affected > 0
            ? ` ${affected} pengeluaran yang menyangkut dia juga akan terhapus.`
            : "";
        const ok = await askConfirm({
          title: `Hapus peserta ${person.name}?`,
          message: `Peserta akan dihapus dari daftar.${detail}`,
          confirmLabel: "Hapus peserta",
          dangerous: true,
        });
        if (!ok) return;
        people = people.filter((p) => p.id !== person.id);
        expenses = expenses.filter(
          (e) => e.payerId !== person.id && !e.splitIds.includes(person.id)
        );
        splitChecked.delete(person.id);
        splitWeights.delete(person.id);
        if (editingId !== null && !expenses.some((e) => e.id === editingId)) {
          exitEditMode();
          el("expenseForm").reset();
        }
        save();
        render();
        announce(`Peserta ${person.name} dihapus.`);
      });

      li.append(span, del);
      return li;
    });
    personList.replaceChildren(...personItems);

    const payerSelect = el("expensePayer");
    const previousPayer = payerSelect.value;
    const payerOptions = people.map((person) => {
      const opt = document.createElement("option");
      opt.value = String(person.id);
      opt.textContent = person.name;
      return opt;
    });
    payerSelect.replaceChildren(...payerOptions);
    if (people.some((p) => String(p.id) === previousPayer)) {
      payerSelect.value = previousPayer;
    }

    const splitList = el("splitList");
    const splitRows = people.map((person) => {
      const row = document.createElement("div");
      row.className = "split-row";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.id = `split-check-${person.id}`;
      box.value = String(person.id);
      box.checked = splitChecked.has(person.id);

      const label = document.createElement("label");
      label.className = "split-check-label";
      label.htmlFor = box.id;
      label.textContent = person.name;

      const weight = document.createElement("input");
      weight.type = "number";
      weight.className = "split-weight";
      weight.min = "0";
      weight.step = "0.5";
      weight.value = String(weightOf(person.id));
      weight.disabled = !box.checked;
      weight.dataset.personId = String(person.id);
      weight.setAttribute("aria-label", `Porsi ${person.name}`);

      box.addEventListener("change", () => {
        if (box.checked) splitChecked.add(person.id);
        else splitChecked.delete(person.id);
        weight.disabled = !box.checked;
      });
      weight.addEventListener("input", () => {
        const parsed = parseFloat(weight.value);
        splitWeights.set(person.id, Number.isFinite(parsed) ? parsed : 0);
      });

      row.append(box, label, weight);
      return row;
    });
    splitList.replaceChildren(...splitRows);

    const hasPeople = people.length > 0;
    el("btnSplitAll").disabled = !hasPeople;
    el("btnSplitNone").disabled = !hasPeople;
    el("btnSplitEqual").disabled = !hasPeople;

    const expenseList = el("expenseList");
    el("expenseEmpty").style.display = expenses.length ? "none" : "block";
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
    const expenseItems = expenses.toReversed().map((expense) => {
      const li = document.createElement("li");
      li.className = "expense-item";

      const info = document.createElement("div");
      info.className = "expense-info";
      const title = document.createElement("div");
      title.textContent = `${expense.desc} · ${rupiah(expense.amount)}`;
      const meta = document.createElement("div");
      meta.className = "meta";
      const extraParts = [];
      if (expense.taxPercent > 0) extraParts.push(`pajak ${formatWeight(expense.taxPercent)}%`);
      if (expense.discount > 0) extraParts.push(`diskon ${rupiah(expense.discount)}`);
      const extraText = extraParts.length ? ` (${extraParts.join(", ")})` : "";
      meta.textContent = `Dibayar ${nameOf(expense.payerId)}, dibagi ke ${describeSplit(expense, nameOf)}${extraText}`;
      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "expense-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit pengeluaran ${expense.desc}`);
      edit.addEventListener("click", () => startEdit(expense));

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Hapus";
      del.setAttribute("aria-label", `Hapus pengeluaran ${expense.desc}`);
      del.addEventListener("click", () => {
        expenses = expenses.filter((e) => e.id !== expense.id);
        if (editingId === expense.id) {
          exitEditMode();
          el("expenseForm").reset();
        }
        save();
        render();
        announce(`Pengeluaran ${expense.desc} dihapus.`);
      });

      actions.append(edit, del);
      li.append(info, actions);
      return li;
    });
    expenseList.replaceChildren(...expenseItems);

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    el("totalAmount").textContent = rupiah(total);

    const balances = computeBalances(people, expenses);
    const details = computeDetails(people, expenses);
    const balanceList = el("balanceList");
    const balanceItems = people.map((person) => {
      const d = details[person.id];
      const li = document.createElement("li");
      li.className = "balance-item";
      const head = document.createElement("div");
      head.append(document.createTextNode(`${person.name}: `));
      const status = document.createElement("span");
      if (d.balance > 0) {
        status.className = "plus";
        status.textContent = `kelebihan ${rupiah(d.balance)}`;
      } else if (d.balance < 0) {
        status.className = "minus";
        status.textContent = `kurang ${rupiah(-d.balance)}`;
      } else {
        status.className = "lunas";
        status.textContent = "lunas";
      }
      head.append(status);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `Sudah bayar ${rupiah(d.paid)}, jatah ${rupiah(d.share)}`;
      li.append(head, meta);
      return li;
    });
    balanceList.replaceChildren(...balanceItems);

    const settlements = computeSettlements(people, balances);
    const validSettlementKeys = new Set(settlements.map(settlementKey));
    let settledPruned = false;
    for (const key of settledKeys) {
      if (!validSettlementKeys.has(key)) {
        settledKeys.delete(key);
        settledPruned = true;
      }
    }
    if (settledPruned) save();

    const settlementList = el("settlementList");
    el("settlementEmpty").style.display = settlements.length ? "none" : "block";
    const settlementItems = settlements.map((s) => {
      const key = settlementKey(s);
      const isSettled = settledKeys.has(key);
      const li = document.createElement("li");
      li.className = "settlement-item" + (isSettled ? " is-settled" : "");

      const textSpan = document.createElement("span");
      textSpan.className = "settlement-text";
      textSpan.textContent = `${s.from} → ${s.to}: ${rupiah(s.amount)}`;

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "settlement-toggle";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = isSettled;
      checkbox.setAttribute("aria-label", `Tandai transfer ${s.from} ke ${s.to} ${rupiah(s.amount)} lunas`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) settledKeys.add(key);
        else settledKeys.delete(key);
        save();
        render();
      });
      const toggleText = document.createElement("span");
      toggleText.textContent = isSettled ? "Lunas" : "Tandai lunas";
      toggleLabel.append(checkbox, toggleText);

      li.append(textSpan, toggleLabel);
      return li;
    });
    settlementList.replaceChildren(...settlementItems);

    el("btnCopy").dataset.summary = buildSummary(
      people,
      expenses,
      details,
      settlements,
      total,
      settledKeys,
      billTitle
    );
    updateNetPreview();
  }

  function buildSummary(people, expenses, details, settlements, total, settledSet, title) {
    if (!expenses.length) return "";
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
    const header = title.trim()
      ? `Split Bill Kelompok: ${title.trim()}\nTotal: ${rupiah(total)}`
      : `Split Bill Kelompok\nTotal: ${rupiah(total)}`;
    const parts = [header];

    const expenseLines = expenses.map((e) => {
      const weighted = e.splitIds.some((id) => expenseWeight(e, id) !== 1);
      const splitText = weighted ? `, dibagi ke ${describeSplit(e, nameOf)}` : "";
      return `• ${e.desc}: ${rupiah(e.amount)} (dibayar ${nameOf(e.payerId)}${splitText})`;
    });
    parts.push(`Pengeluaran:\n${expenseLines.join("\n")}`);

    const detailLines = people.map((p) => {
      const d = details[p.id];
      const status =
        d.balance > 0
          ? `kelebihan ${rupiah(d.balance)}`
          : d.balance < 0
            ? `kurang ${rupiah(-d.balance)}`
            : "lunas";
      return `• ${p.name}: bayar ${rupiah(d.paid)}, jatah ${rupiah(d.share)}, ${status}`;
    });
    parts.push(`Rincian per orang:\n${detailLines.join("\n")}`);

    if (settlements.length) {
      const lines = settlements.map((s) => {
        const done = settledSet.has(settlementKey(s)) ? " [Lunas]" : "";
        return `• ${s.from} → ${s.to}: ${rupiah(s.amount)}${done}`;
      });
      parts.push(`Siapa transfer ke siapa:\n${lines.join("\n")}`);
    } else {
      parts.push("Siapa transfer ke siapa:\nTidak ada, semua sudah lunas.");
    }
    return parts.join("\n\n");
  }

  function startEdit(expense) {
    splitCheckedBeforeEdit = new Set(splitChecked);
    splitWeightsBeforeEdit = new Map(splitWeights);
    editingId = expense.id;
    splitChecked = new Set(expense.splitIds);
    splitWeights = new Map(
      expense.splitIds.map((id) => [id, expenseWeight(expense, id)])
    );
    el("expenseDesc").value = expense.desc;
    el("expenseAmount").value = groupThousands(expense.subtotal || expense.amount);
    el("expenseTax").value = String(expense.taxPercent || 0);
    el("expenseDiscount").value = groupThousands(expense.discount || 0);
    if ((expense.taxPercent || 0) > 0 || (expense.discount || 0) > 0) {
      el("extraChargeDetails").open = true;
    }
    el("expenseSubmit").textContent = "Simpan perubahan";
    el("expenseCancel").hidden = false;
    setFieldError(null, el("expenseError"), "");
    render();
    el("expensePayer").value = String(expense.payerId);
    el("expenseDesc").focus();
  }

  el("billTitle").addEventListener("input", (event) => {
    billTitle = event.target.value;
    save();
    el("printBillTitle").textContent = billTitle.trim() ? `Nota: ${billTitle.trim()}` : "";
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const balances = computeBalances(people, expenses);
    const details = computeDetails(people, expenses);
    const settlements = computeSettlements(people, balances);
    el("btnCopy").dataset.summary = buildSummary(
      people,
      expenses,
      details,
      settlements,
      total,
      settledKeys,
      billTitle
    );
  });

  el("btnNewBill").addEventListener("click", async () => {
    if (people.length === 0 && expenses.length === 0 && !billTitle.trim()) {
      setStatus("Nota sudah kosong.");
      return;
    }
    const ok = await askConfirm({
      title: "Mulai nota baru?",
      message: "Semua peserta, pengeluaran, dan tanda lunas pada nota saat ini akan dikosongkan.",
      confirmLabel: "Mulai nota baru",
      dangerous: true,
    });
    if (!ok) return;
    people = [];
    expenses = [];
    billTitle = "";
    settledKeys = new Set();
    splitChecked = new Set();
    splitWeights = new Map();
    exitEditMode();
    el("expenseForm").reset();
    el("personForm").reset();
    save();
    render();
    setStatus("Nota baru dimulai.");
    announce("Nota baru dimulai.");
  });

  el("btnClearCorrupt").addEventListener("click", () => {
    localStorage.removeItem(PEOPLE_KEY);
    localStorage.removeItem(EXPENSES_KEY);
    localStorage.removeItem(TITLE_KEY);
    localStorage.removeItem(SETTLED_KEY);
    people = [];
    expenses = [];
    billTitle = "";
    settledKeys = new Set();
    splitChecked = new Set();
    splitWeights = new Map();
    dataCorrupted = false;
    exitEditMode();
    el("expenseForm").reset();
    el("personForm").reset();
    render();
  });

  el("personForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = el("personName");
    const errEl = el("personError");
    const name = input.value.trim();
    if (!name) {
      setFieldError(input, errEl, "Isi dulu nama peserta.");
      input.focus();
      return;
    }
    const duplicate = people.some(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setFieldError(
        input,
        errEl,
        `Nama ${name} sudah ada di daftar peserta. Pakai nama yang berbeda.`
      );
      input.focus();
      return;
    }
    setFieldError(input, errEl, "");
    const person = { id: generateId(), name };
    people.push(person);
    splitChecked.add(person.id);
    save();
    render();
    event.target.reset();
    input.focus();
    announce(`Peserta ${name} ditambahkan.`);
  });

  el("personName").addEventListener("input", () => {
    setFieldError(el("personName"), el("personError"), "");
  });

  el("expenseAmount").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    event.target.value = digits ? groupThousands(digits) : "";
    el("expenseAmount").setAttribute("aria-invalid", "false");
    updateNetPreview();
  });

  el("expenseTax").addEventListener("input", updateNetPreview);

  el("expenseDiscount").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    event.target.value = digits ? groupThousands(digits) : "0";
    updateNetPreview();
  });

  ["expenseDesc", "expensePayer"].forEach((id) => {
    el(id).addEventListener("input", () => {
      el(id).setAttribute("aria-invalid", "false");
    });
  });

  el("btnSplitAll").addEventListener("click", () => {
    splitChecked = new Set(people.map((p) => p.id));
    render();
  });

  el("btnSplitNone").addEventListener("click", () => {
    splitChecked = new Set();
    render();
  });

  el("btnSplitEqual").addEventListener("click", () => {
    splitWeights = new Map();
    render();
  });

  el("expenseCancel").addEventListener("click", () => {
    if (splitCheckedBeforeEdit) splitChecked = splitCheckedBeforeEdit;
    if (splitWeightsBeforeEdit) splitWeights = splitWeightsBeforeEdit;
    exitEditMode();
    el("expenseForm").reset();
    el("extraChargeDetails").open = false;
    render();
  });

  el("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const descInput = el("expenseDesc");
    const amountInput = el("expenseAmount");
    const payerSelect = el("expensePayer");
    const errEl = el("expenseError");

    const desc = descInput.value.trim();
    const subtotal = parseAmountInput(amountInput.value);
    const taxPercent = Math.max(0, Number(el("expenseTax").value) || 0);
    const discount = parseAmountInput(el("expenseDiscount").value);
    const amount = computeNetAmount(subtotal, taxPercent, discount);
    const payerId = Number(payerSelect.value);
    const splitIds = [
      ...el("splitList").querySelectorAll('input[type="checkbox"]:checked'),
    ].map((b) => Number(b.value));

    if (!desc) {
      setFieldError(descInput, errEl, "Isi dulu nama pengeluaran.");
      descInput.focus();
      return;
    }
    if (!subtotal) {
      setFieldError(amountInput, errEl, "Isi jumlah pengeluaran dengan nominal lebih dari 0.");
      amountInput.focus();
      return;
    }
    if (!payerId) {
      setFieldError(payerSelect, errEl, "Tambahkan peserta dulu dan pilih pembayarnya.");
      payerSelect.focus();
      return;
    }
    if (amount <= 0) {
      setFieldError(amountInput, errEl, "Total akhir setelah diskon tidak boleh 0 atau kurang.");
      amountInput.focus();
      return;
    }
    if (splitIds.length === 0) {
      setFieldError(null, errEl, "Centang minimal satu orang untuk dibagi.");
      return;
    }

    const weights = {};
    let totalWeight = 0;
    for (const input of el("splitList").querySelectorAll(".split-weight")) {
      const id = Number(input.dataset.personId);
      if (!splitIds.includes(id)) continue;
      const parsed = parseFloat(input.value);
      const w = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      weights[id] = w;
      totalWeight += w;
    }
    if (totalWeight <= 0) {
      setFieldError(
        null,
        errEl,
        "Total porsi orang yang dicentang masih 0. Isi porsi minimal satu orang."
      );
      return;
    }

    setFieldError(null, errEl, "");
    const payload = { id: editingId !== null ? editingId : generateId(), desc, amount, payerId, splitIds, weights };
    if (taxPercent > 0 || discount > 0) {
      payload.subtotal = subtotal;
      if (taxPercent > 0) payload.taxPercent = taxPercent;
      if (discount > 0) payload.discount = discount;
    }

    if (editingId !== null) {
      const idx = expenses.findIndex((e) => e.id === editingId);
      if (idx >= 0) expenses[idx] = payload;
      exitEditMode();
      announce(`Pengeluaran ${desc} diperbarui.`);
    } else {
      expenses.push(payload);
      announce(`Pengeluaran ${desc} ditambahkan.`);
    }
    save();
    event.target.reset();
    el("expenseDiscount").value = "0";
    el("expenseTax").value = "0";
    el("extraChargeDetails").open = false;
    splitWeights = new Map();
    render();
    descInput.focus();
  });

  el("btnCopy").addEventListener("click", async () => {
    const summary = el("btnCopy").dataset.summary;
    if (!summary) {
      setStatus("Belum ada hitungan untuk disalin.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
      setStatus("Ringkasan tersalin. Tinggal tempel ke WhatsApp.");
    } catch {
      setStatus("Gagal menyalin otomatis. Salin manual dari daftar di atas.", true);
    }
  });

  el("btnShareLink").addEventListener("click", async () => {
    if (people.length === 0 && expenses.length === 0) {
      setStatus("Belum ada data nota untuk dibagikan.", true);
      return;
    }
    try {
      const encoded = encodeSharePayload({
        title: billTitle,
        people,
        expenses,
        settled: [...settledKeys],
      });
      const url = new URL(window.location.href);
      url.hash = `data=${encoded}`;
      await navigator.clipboard.writeText(url.toString());
      setStatus("Link nota tersalin. Siap dibagikan ke teman.");
    } catch {
      setStatus("Gagal menyalin link nota secara otomatis.", true);
    }
  });

  el("btnDownload").addEventListener("click", () => {
    const summary = el("btnCopy").dataset.summary;
    if (!summary) {
      setStatus("Belum ada hitungan untuk diunduh.", true);
      return;
    }
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ringkasan-split-bill.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Ringkasan diunduh sebagai berkas teks.");
  });

  el("btnPrint").addEventListener("click", () => {
    window.print();
  });

  el("btnExportJson").addEventListener("click", () => {
    const payload = {
      app: "split-bill-kelompok",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        title: billTitle,
        people,
        expenses,
        settled: [...settledKeys],
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "split-bill-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Cadangan JSON diekspor (${people.length} peserta, ${expenses.length} pengeluaran).`);
  });

  el("btnImportJson").addEventListener("click", () => {
    el("importJsonInput").value = "";
    el("importJsonInput").click();
  });

  el("importJsonInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || parsed.app !== "split-bill-kelompok" || !parsed.data) {
        throw new Error("Format berkas bukan cadangan Split Bill Kelompok.");
      }
      const nextPeople = sanitizePeopleList(parsed.data.people);
      const nextExpenses = sanitizeExpensesList(parsed.data.expenses);
      if (nextPeople === null || nextExpenses === null) {
        throw new Error("Data peserta atau pengeluaran di dalam berkas tidak valid.");
      }
      people = nextPeople;
      expenses = nextExpenses;
      billTitle = typeof parsed.data.title === "string" ? parsed.data.title.trim() : "";
      settledKeys = new Set(sanitizeSettledKeys(parsed.data.settled));
      splitChecked = new Set(people.map((p) => p.id));
      splitWeights = new Map();
      exitEditMode();
      save();
      render();
      setStatus(`Nota dipulihkan: ${people.length} peserta dan ${expenses.length} pengeluaran.`);
    } catch (err) {
      setStatus(
        err instanceof Error ? `Gagal mengimpor JSON: ${err.message}` : "Gagal mengimpor JSON.",
        true
      );
    }
  });

  async function checkSharedHash() {
    const hash = window.location.hash;
    if (!hash.startsWith("#data=")) return;
    try {
      const shared = decodeSharePayload(hash.slice(6));
      const hasExisting = people.length > 0 || expenses.length > 0;
      if (hasExisting) {
        const ok = await askConfirm({
          title: "Muat nota dari tautan?",
          message:
            "Browser ini sudah menyimpan hitungan patungan lain. Muat nota dari tautan dan ganti data saat ini?",
          confirmLabel: "Muat nota tautan",
          dangerous: false,
        });
        if (!ok) {
          history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }
      }
      people = shared.people;
      expenses = shared.expenses;
      billTitle = shared.title;
      settledKeys = new Set(shared.settled);
      splitChecked = new Set(people.map((p) => p.id));
      splitWeights = new Map();
      exitEditMode();
      save();
      render();
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setStatus("Nota dari tautan berhasil dimuat.");
    } catch {
      setStatus("Tautan nota rusak atau tidak valid.", true);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const isLocalHost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (window.location.protocol !== "https:" && !isLocalHost) return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  render();
  checkSharedHash();
  registerServiceWorker();
}
