# Split Bill Kelompok

Kalkulator patungan buat nongkrong, tugas kelompok, atau liburan bareng: catat siapa bayar apa, lalu keluar hitungan **siapa transfer ke siapa berapa**, dengan jumlah transaksi sesedikit mungkin.

Dibuat tanpa login dan tanpa install: langsung jalan di browser, gratis.

## Live demo

Coba langsung di browser: [weinssy.github.io/split-bill-kelompok](https://weinssy.github.io/split-bill-kelompok/)

## Fitur

- Tambah/hapus peserta patungan (nama duplikat ditolak dengan fokus otomatis ke kolom input; hapus peserta meminta konfirmasi lewat modal `<dialog>` native karena pengeluaran yang menyangkut dia ikut terhapus)
- **Judul nota & Nota baru:** beri judul opsional pada acara patungan untuk kop cetak dan ringkasan, atau mulai ulang nota bersih lewat tombol **Nota baru**
- Catat pengeluaran: nama, jumlah subtotal (otomatis terformat pemisah ribuan saat mengetik), siapa yang membayar, **pajak/service (%) dan diskon (Rp)** opsional dengan pratinjau total bersih, dan **pilih siapa saja yang ikut dibagi** disertai tombol cepat **Pilih semua**, **Kosongkan**, dan **Samakan porsi (1)**
- **Pembagian tidak rata dengan porsi:** tiap orang yang ikut dibagi bisa diberi porsi berbeda (mis. 2 untuk yang makan dobel, 0,5 untuk yang ikut setengah), bawaan tiap orang 1 porsi. Jatah dihitung sebanding dengan porsi dan dibulatkan adil sampai totalnya pas
- **Edit pengeluaran** yang salah ketik tanpa harus hapus dan input ulang
- Rincian per orang: sudah bayar berapa, jatah berapa, dan statusnya (kelebihan, kurang, atau lunas). Peserta bersaldo nol tetap ditampilkan
- **Penyelesaian otomatis & tanda Lunas:** algoritma greedy mencocokkan penyeimbang terbesar lebih dulu agar jumlah transfer seminimal mungkin, lengkap dengan checkbox **Tandai lunas** per baris transfer
- Tombol **Salin ringkasan untuk WhatsApp**, **Salin link nota** (berbagi hitungan via hash URL tanpa backend), **Cetak nota**, **Unduh teks**, serta **Ekspor / Impor JSON** untuk cadangan lokal
- Dukungan **PWA offline** (`manifest.webmanifest` + `sw.js`) saat disajikan lewat HTTP/HTTPS dan pemulihan saat data `localStorage` rusak
- Format uang Rupiah yang rapi, angka selalu rata digit seperti cetakan struk

## Cara pakai

1. Tambahkan nama semua peserta.
2. Setiap ada yang membayar, catat pengeluarannya, atur pajak/diskon bila ada, dan centang siapa saja yang ikut patungan.
3. Lihat bagian "Siapa Transfer ke Siapa", ikuti daftar transfernya, dan tandai **Lunas** saat sudah dibayar.

## Contoh

Andi, Budi, dan Cici makan bareng. Andi membayar Rp150.000 untuk bertiga. Cici membayar parkir Rp10.000 untuk bertiga.

Hasilnya cukup 2 transfer: **Budi → Andi: Rp53.333** dan **Cici → Andi: Rp43.333**.

## Tech Stack

- HTML5 semantik (`<header>`, `<main>`, `<dialog>`, `<details>`)
- CSS modern (container queries, logical properties, `scrollbar-gutter: stable`, `prefers-reduced-motion`)
- Vanilla JavaScript (tanpa framework, tanpa build step, fungsi inti teruji dengan `node:test`)
- `localStorage` untuk penyimpanan lokal dan Service Worker untuk cache offline

## Jalankan lokal & Uji Otomatis

```bash
# Jalankan server lokal dari folder proyek
python -m http.server 8000
# lalu buka http://localhost:8000 di browser

# Jalankan unit test Node (butuh Node.js 18+)
node --test test.js
```

## Struktur File

```text
split-bill-kelompok/
├── index.html            # Halaman utama (judul nota, peserta, pengeluaran, hasil, dialog)
├── style.css             # Tata letak nota, container queries, responsif, dan mode cetak
├── script.js             # Logika patungan murni, UI DOM, share link, ekspor/impor, dan SW
├── test.js               # Unit test Node untuk fungsi perhitungan dan sanitasi data
├── manifest.webmanifest  # Metadata PWA
├── sw.js                 # Service worker network-first untuk cache aset inti
├── icon.svg              # Ikon nota SVG
├── DESIGN.md             # Arah desain: motif nota, palet kontras WCAG, tujuan tiap teknik
└── README.md
```

## Sengaja ditunda

- Simpan beberapa acara patungan terpisah dalam satu daftar riwayat
- Sinkron otomatis antar perangkat / akun pengguna
- Unggah gambar bukti transfer

## Lisensi

MIT
