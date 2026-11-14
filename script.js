// Logika inti (splitAmount, computeBalances, computeSettlements) tidak menyentuh
// DOM supaya bisa diuji langsung di Node. Lihat module.exports di bawah.

// Bagi amount rata ke count orang dalam rupiah bulat. Sisa pembagian diberikan
// 1 rupiah ke orang-orang pertama supaya total bagian selalu sama dengan amount.
function splitAmount(amount, count) {
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Saldo = total yang dibayar - total bagian yang harus ditanggung.
// Positif berarti kelebihan bayar (berhak menerima), negatif berarti harus transfer.
function computeBalances(people, expenses) {
  const balances = {};
  for (const person of people) balances[person.id] = 0;

  for (const expense of expenses) {
    if (!(expense.payerId in balances)) continue;
    balances[expense.payerId] += expense.amount;

    const targets = expense.splitIds.filter((id) => id in balances);
    if (targets.length === 0) continue;
    const shares = splitAmount(expense.amount, targets.length);
    targets.forEach((id, i) => {
      balances[id] -= shares[i];
    });
  }
  return balances;
}

// Pasangkan penyeimbang terbesar lebih dulu (greedy) supaya jumlah transfer sedikit.
function computeSettlements(people, balances) {
  const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
  const debtors = people
    .filter((p) => balances[p.id] < 0)
    .map((p) => ({ id: p.id, amount: -balances[p.id] }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = people
    .filter((p) => balances[p.id] > 0)
    .map((p) => ({ id: p.id, amount: balances[p.id] }))
    .sort((a, b) => b.amount - a.amount);

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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { splitAmount, computeBalances, computeSettlements };
}

if (typeof document !== "undefined") {
  const PEOPLE_KEY = "sb_people";
  const EXPENSES_KEY = "sb_expenses";
  let people = JSON.parse(localStorage.getItem(PEOPLE_KEY) || "[]");
  let expenses = JSON.parse(localStorage.getItem(EXPENSES_KEY) || "[]");

  const el = (id) => document.getElementById(id);
  const rupiah = (n) =>
    "Rp" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  function save() {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  }

  function render() {
    const personList = el("personList");
    personList.innerHTML = "";
    el("personEmpty").style.display = people.length ? "none" : "block";
    for (const person of people) {
      const li = document.createElement("li");
      li.className = "chip";
      const span = document.createElement("span");
      span.textContent = person.name;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Hapus peserta ${person.name}`);
      del.title = "Hapus peserta (pengeluaran yang menyangkut dia ikut terhapus)";
      del.addEventListener("click", () => {
        people = people.filter((p) => p.id !== person.id);
        expenses = expenses.filter(
          (e) => e.payerId !== person.id && !e.splitIds.includes(person.id)
        );
        save();
        render();
      });
      li.append(span, del);
      personList.appendChild(li);
    }

    const payerSelect = el("expensePayer");
    payerSelect.innerHTML = "";
    for (const person of people) {
      const opt = document.createElement("option");
      opt.value = person.id;
      opt.textContent = person.name;
      payerSelect.appendChild(opt);
    }
    const splitList = el("splitList");
    splitList.innerHTML = "";
    for (const person of people) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = person.id;
      box.checked = true;
      label.append(box, document.createTextNode(person.name));
      splitList.appendChild(label);
    }

    const expenseList = el("expenseList");
    expenseList.innerHTML = "";
    el("expenseEmpty").style.display = expenses.length ? "none" : "block";
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
    for (const expense of expenses) {
      const li = document.createElement("li");
      li.className = "expense-item";
      const info = document.createElement("div");
      info.className = "expense-info";
      const title = document.createElement("div");
      title.textContent = `${expense.desc} · ${rupiah(expense.amount)}`;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `Dibayar ${nameOf(expense.payerId)}, dibagi ke ${expense.splitIds.map(nameOf).join(", ")}`;
      info.append(title, meta);
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Hapus";
      del.setAttribute("aria-label", `Hapus pengeluaran ${expense.desc}`);
      del.addEventListener("click", () => {
        expenses = expenses.filter((e) => e.id !== expense.id);
        save();
        render();
      });
      li.append(info, del);
      expenseList.appendChild(li);
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    el("totalAmount").textContent = rupiah(total);

    const balances = computeBalances(people, expenses);
    const balanceList = el("balanceList");
    balanceList.innerHTML = "";
    for (const person of people) {
      const b = balances[person.id];
      if (b === 0) continue;
      const li = document.createElement("li");
      li.className = "balance-item";
      li.innerHTML =
        b > 0
          ? `${person.name}: <span class="plus">kelebihan ${rupiah(b)}</span>`
          : `${person.name}: <span class="minus">kurang ${rupiah(-b)}</span>`;
      balanceList.appendChild(li);
    }

    const settlements = computeSettlements(people, balances);
    const settlementList = el("settlementList");
    settlementList.innerHTML = "";
    el("settlementEmpty").style.display = settlements.length ? "none" : "block";
    for (const s of settlements) {
      const li = document.createElement("li");
      li.className = "settlement-item";
      li.textContent = `${s.from} → ${s.to}: ${rupiah(s.amount)}`;
      settlementList.appendChild(li);
    }
    el("btnCopy").dataset.summary = buildSummary(total, settlements);
  }

  function buildSummary(total, settlements) {
    if (!settlements.length) return "";
    const lines = settlements.map((s) => `• ${s.from} → ${s.to}: ${rupiah(s.amount)}`);
    return `Split Bill Kelompok\nTotal: ${rupiah(total)}\n\nSiapa transfer ke siapa:\n${lines.join("\n")}`;
  }

  el("personForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el("personName").value.trim();
    if (!name) return;
    people.push({ id: Date.now(), name });
    save();
    render();
    event.target.reset();
  });

  el("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const desc = el("expenseDesc").value.trim();
    const amount = Number(el("expenseAmount").value);
    const payerId = Number(el("expensePayer").value);
    const splitIds = [...el("splitList").querySelectorAll("input:checked")].map((b) =>
      Number(b.value)
    );
    if (!desc || !amount || !payerId) {
      el("expenseError").textContent = "Isi dulu nama pengeluaran, jumlah, dan pembayarnya.";
      return;
    }
    if (splitIds.length === 0) {
      el("expenseError").textContent = "Centang minimal satu orang untuk dibagi.";
      return;
    }
    el("expenseError").textContent = "";
    expenses.push({ id: Date.now(), desc, amount, payerId, splitIds });
    save();
    render();
    event.target.reset();
    // Form reset mengosongkan centang, jadi centang ulang semua peserta.
    el("splitList").querySelectorAll("input").forEach((b) => (b.checked = true));
  });

  el("btnCopy").addEventListener("click", async () => {
    const summary = el("btnCopy").dataset.summary;
    if (!summary) {
      el("copyStatus").textContent = "Belum ada hitungan untuk disalin.";
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
      el("copyStatus").textContent = "Ringkasan tersalin. Tinggal tempel ke WhatsApp.";
    } catch {
      el("copyStatus").textContent = "Gagal menyalin otomatis. Salin manual dari daftar di atas.";
    }
  });

  render();
}
