// Logika inti (splitAmount, computeBalances, computeSettlements, computeDetails)
// tidak menyentuh DOM supaya bisa diuji langsung di Node. Lihat module.exports
// di bawah.

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

// Rincian per orang: berapa yang sudah dia bayar, berapa jatah yang dia
// tanggung, dan saldonya (bayar - jatah). Konsisten dengan computeBalances.
function computeDetails(people, expenses) {
  const details = {};
  for (const person of people) {
    details[person.id] = { id: person.id, name: person.name, paid: 0, share: 0, balance: 0 };
  }

  for (const expense of expenses) {
    if (!(expense.payerId in details)) continue;
    details[expense.payerId].paid += expense.amount;

    const targets = expense.splitIds.filter((id) => id in details);
    if (targets.length === 0) continue;
    const shares = splitAmount(expense.amount, targets.length);
    targets.forEach((id, i) => {
      details[id].share += shares[i];
    });
  }
  for (const person of people) {
    details[person.id].balance = details[person.id].paid - details[person.id].share;
  }
  return details;
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

// Kelompokkan digit dengan titik pemisah ribuan, gaya Indonesia.
// Menerima string digit atau angka, mengembalikan string terformat.
function groupThousands(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Ambil angka murni dari teks input jumlah (titik dan karakter lain dibuang).
function parseAmountInput(text) {
  const digits = String(text).replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    splitAmount,
    computeBalances,
    computeSettlements,
    computeDetails,
    groupThousands,
    parseAmountInput,
  };
}

if (typeof document !== "undefined") {
  const PEOPLE_KEY = "sb_people";
  const EXPENSES_KEY = "sb_expenses";

  // Baca array dari localStorage dengan pengaman. JSON rusak atau bentuk data
  // yang salah tidak boleh mematikan aplikasi: tandai sebagai rusak supaya UI
  // bisa memperingatkan pengguna dan menawarkan pemulihan.
  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return { data: [], corrupted: false };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { data: [], corrupted: true };
      return { data: parsed, corrupted: false };
    } catch {
      return { data: [], corrupted: true };
    }
  }

  const loadedPeople = loadArray(PEOPLE_KEY);
  const loadedExpenses = loadArray(EXPENSES_KEY);
  let people = loadedPeople.data;
  let expenses = loadedExpenses.data;
  let dataCorrupted = loadedPeople.corrupted || loadedExpenses.corrupted;

  // Status centang "dibagi untuk" disimpan di state, bukan dibaca dari DOM,
  // supaya render ulang tidak membuang pilihan pengguna. Peserta yang sudah
  // ada dan peserta baru mulai dalam keadaan tercentang.
  let splitChecked = new Set(people.map((p) => p.id));
  // Id pengeluaran yang sedang diedit, atau null saat form dalam mode tambah.
  let editingId = null;
  // Salinan status centang sebelum masuk mode edit, untuk tombol Batal.
  let splitCheckedBeforeEdit = null;

  const el = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp" + groupThousands(Math.round(n));

  function save() {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
    // Data baru yang barusan disimpan menggantikan data rusak, jadi
    // peringatan tidak perlu tampil lagi.
    if (dataCorrupted) {
      dataCorrupted = false;
      el("dataWarning").hidden = true;
    }
  }

  function exitEditMode() {
    editingId = null;
    splitCheckedBeforeEdit = null;
    el("expenseSubmit").textContent = "Tambah pengeluaran";
    el("expenseCancel").hidden = true;
    el("expenseError").textContent = "";
  }

  function render() {
    el("dataWarning").hidden = !dataCorrupted;

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
        const affected = expenses.filter(
          (e) => e.payerId === person.id || e.splitIds.includes(person.id)
        ).length;
        const detail =
          affected > 0
            ? ` ${affected} pengeluaran yang menyangkut dia juga akan terhapus.`
            : "";
        if (!window.confirm(`Hapus peserta ${person.name}?${detail}`)) return;
        people = people.filter((p) => p.id !== person.id);
        expenses = expenses.filter(
          (e) => e.payerId !== person.id && !e.splitIds.includes(person.id)
        );
        splitChecked.delete(person.id);
        if (editingId !== null && !expenses.some((e) => e.id === editingId)) {
          exitEditMode();
          el("expenseForm").reset();
        }
        save();
        render();
      });
      li.append(span, del);
      personList.appendChild(li);
    }

    const payerSelect = el("expensePayer");
    const previousPayer = payerSelect.value;
    payerSelect.innerHTML = "";
    for (const person of people) {
      const opt = document.createElement("option");
      opt.value = person.id;
      opt.textContent = person.name;
      payerSelect.appendChild(opt);
    }
    if (people.some((p) => String(p.id) === previousPayer)) {
      payerSelect.value = previousPayer;
    }

    const splitList = el("splitList");
    splitList.innerHTML = "";
    for (const person of people) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = person.id;
      box.checked = splitChecked.has(person.id);
      box.addEventListener("change", () => {
        if (box.checked) splitChecked.add(person.id);
        else splitChecked.delete(person.id);
      });
      label.append(box, document.createTextNode(person.name));
      splitList.appendChild(label);
    }

    const expenseList = el("expenseList");
    expenseList.innerHTML = "";
    el("expenseEmpty").style.display = expenses.length ? "none" : "block";
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
    // Penyimpanan tetap kronologis, tampilan saja yang dibalik: terbaru di atas.
    for (const expense of [...expenses].reverse()) {
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
      });
      actions.append(edit, del);
      li.append(info, actions);
      expenseList.appendChild(li);
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    el("totalAmount").textContent = rupiah(total);

    const balances = computeBalances(people, expenses);
    const details = computeDetails(people, expenses);
    const balanceList = el("balanceList");
    balanceList.innerHTML = "";
    for (const person of people) {
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
    el("btnCopy").dataset.summary = buildSummary(people, expenses, details, settlements, total);
  }

  function buildSummary(people, expenses, details, settlements, total) {
    if (!expenses.length) return "";
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || "?";
    const parts = [`Split Bill Kelompok\nTotal: ${rupiah(total)}`];

    const expenseLines = expenses.map(
      (e) => `• ${e.desc}: ${rupiah(e.amount)} (dibayar ${nameOf(e.payerId)})`
    );
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
      const lines = settlements.map((s) => `• ${s.from} → ${s.to}: ${rupiah(s.amount)}`);
      parts.push(`Siapa transfer ke siapa:\n${lines.join("\n")}`);
    } else {
      parts.push("Siapa transfer ke siapa:\nTidak ada, semua sudah lunas.");
    }
    return parts.join("\n\n");
  }

  function startEdit(expense) {
    splitCheckedBeforeEdit = new Set(splitChecked);
    editingId = expense.id;
    splitChecked = new Set(expense.splitIds);
    el("expenseDesc").value = expense.desc;
    el("expenseAmount").value = groupThousands(expense.amount);
    el("expenseError").textContent = "";
    el("expenseSubmit").textContent = "Simpan perubahan";
    el("expenseCancel").hidden = false;
    render();
    el("expensePayer").value = String(expense.payerId);
    el("expenseDesc").focus();
  }

  el("btnClearCorrupt").addEventListener("click", () => {
    localStorage.removeItem(PEOPLE_KEY);
    localStorage.removeItem(EXPENSES_KEY);
    people = [];
    expenses = [];
    splitChecked = new Set();
    dataCorrupted = false;
    exitEditMode();
    el("expenseForm").reset();
    el("personForm").reset();
    render();
  });

  el("personForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el("personName").value.trim();
    if (!name) return;
    const duplicate = people.some(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      el("personError").textContent = `Nama ${name} sudah ada di daftar peserta. Pakai nama yang berbeda.`;
      return;
    }
    el("personError").textContent = "";
    const person = { id: Date.now(), name };
    people.push(person);
    splitChecked.add(person.id);
    save();
    render();
    event.target.reset();
  });

  // Format angka saat mengetik: 1500000 tampil sebagai 1.500.000.
  el("expenseAmount").addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    event.target.value = digits ? groupThousands(digits) : "";
  });

  el("expenseCancel").addEventListener("click", () => {
    if (splitCheckedBeforeEdit) splitChecked = splitCheckedBeforeEdit;
    exitEditMode();
    el("expenseForm").reset();
    render();
  });

  el("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const desc = el("expenseDesc").value.trim();
    const amount = parseAmountInput(el("expenseAmount").value);
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
    if (editingId !== null) {
      const target = expenses.find((e) => e.id === editingId);
      if (target) {
        target.desc = desc;
        target.amount = amount;
        target.payerId = payerId;
        target.splitIds = splitIds;
      }
      exitEditMode();
    } else {
      expenses.push({ id: Date.now(), desc, amount, payerId, splitIds });
    }
    save();
    event.target.reset();
    render();
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

  el("btnDownload").addEventListener("click", () => {
    const summary = el("btnCopy").dataset.summary;
    if (!summary) {
      el("copyStatus").textContent = "Belum ada hitungan untuk diunduh.";
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
    el("copyStatus").textContent = "Ringkasan diunduh sebagai berkas teks.";
  });

  el("btnPrint").addEventListener("click", () => {
    window.print();
  });

  render();
}
