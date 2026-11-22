const test = require("node:test");
const assert = require("node:assert/strict");

const {
  splitAmount,
  computeNetAmount,
  splitWeighted,
  expenseWeight,
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
} = require("./script.js");

test("splitAmount membagi rata dengan sisa 1 rupiah di awal", () => {
  assert.deepEqual(splitAmount(10000, 3), [3334, 3333, 3333]);
  assert.deepEqual(splitAmount(150000, 3), [50000, 50000, 50000]);
});

test("computeNetAmount menghitung pajak persen dan diskon dengan benar", () => {
  assert.equal(computeNetAmount(100000, 11, 0), 111000);
  assert.equal(computeNetAmount(100000, 10, 15000), 95000);
  assert.equal(computeNetAmount(10000, 0, 25000), 0);
});

test("splitWeighted membagi porsi tidak rata dan menjaga total pas", () => {
  const shares = splitWeighted(100000, [
    { id: 1, weight: 2 },
    { id: 2, weight: 1 },
    { id: 3, weight: 0.5 },
  ]);
  assert.equal(shares.reduce((a, b) => a + b, 0), 100000);
  assert.deepEqual(shares, [57143, 28571, 14286]);
});

test("computeBalances, computeDetails, dan computeSettlements konsisten dan minimal", () => {
  const people = [
    { id: 1, name: "Andi" },
    { id: 2, name: "Budi" },
    { id: 3, name: "Cici" },
  ];
  const expenses = [
    { id: 10, desc: "Makan", amount: 150000, payerId: 1, splitIds: [1, 2, 3] },
    { id: 11, desc: "Parkir", amount: 10000, payerId: 3, splitIds: [1, 2, 3] },
  ];
  const balances = computeBalances(people, expenses);
  assert.equal(balances[1] + balances[2] + balances[3], 0);

  const details = computeDetails(people, expenses);
  assert.equal(details[1].paid, 150000);
  assert.equal(details[3].paid, 10000);

  const settlements = computeSettlements(people, balances);
  assert.equal(settlements.length, 2);
  assert.deepEqual(
    settlements.map((s) => ({ from: s.from, to: s.to, amount: s.amount })),
    [
      { from: "Budi", to: "Andi", amount: 53333 },
      { from: "Cici", to: "Andi", amount: 43333 },
    ]
  );
  assert.equal(settlementKey(settlements[0]), "2->1:53333");
});

test("describeSplit dan expenseWeight mendukung data lama tanpa weights", () => {
  const legacy = { id: 1, desc: "Kopi", amount: 30000, payerId: 1, splitIds: [1, 2] };
  assert.equal(expenseWeight(legacy, 1), 1);
  assert.equal(describeSplit(legacy, (id) => (id === 1 ? "Andi" : "Budi")), "Andi, Budi");
});

test("groupThousands dan parseAmountInput memformat dan mem-parse angka Rupiah", () => {
  assert.equal(groupThousands(1500000), "1.500.000");
  assert.equal(parseAmountInput("150.000"), 150000);
  assert.equal(parseAmountInput(""), 0);
});

test("encodeSharePayload dan decodeSharePayload menjaga karakter UTF-8 dan menolak payload invalid", () => {
  const original = {
    title: "Makan Malam: Tim (Café & Kopi)",
    people: [
      { id: 1, name: "Andi" },
      { id: 2, name: "Budi" },
    ],
    expenses: [
      {
        id: 10,
        desc: "Sate & Es Teh",
        amount: 66000,
        subtotal: 60000,
        taxPercent: 10,
        payerId: 1,
        splitIds: [1, 2],
        weights: { 1: 1, 2: 1 },
      },
    ],
    settled: ["2->1:33000"],
  };
  const encoded = encodeSharePayload(original);
  const decoded = decodeSharePayload(encoded);
  assert.equal(decoded.title, "Makan Malam: Tim (Café & Kopi)");
  assert.equal(decoded.people.length, 2);
  assert.equal(decoded.expenses[0].taxPercent, 10);
  assert.deepEqual(decoded.settled, ["2->1:33000"]);

  assert.throws(() => decodeSharePayload("bukan-base64-valid!!!"));
});

test("sanitizePeopleList dan sanitizeExpensesList menyaring entri rusak", () => {
  assert.equal(sanitizePeopleList("invalid"), null);
  assert.deepEqual(
    sanitizePeopleList([
      { id: 1, name: " Andi " },
      { id: 1, name: "Duplikat ID" },
      { id: "abc", name: "Salah" },
    ]),
    [{ id: 1, name: "Andi" }]
  );
  assert.equal(sanitizeExpensesList(null), null);
  assert.deepEqual(
    sanitizeExpensesList([
      { id: 2, desc: "Valid", amount: 5000, payerId: 1, splitIds: [1] },
      { id: 3, desc: "Nol", amount: 0, payerId: 1, splitIds: [1] },
    ]),
    [{ id: 2, desc: "Valid", amount: 5000, payerId: 1, splitIds: [1] }]
  );
});
