# Split Bill Kelompok

Kalkulator patungan buat nongkrong, tugas kelompok, atau liburan bareng: catat siapa bayar apa, lalu keluar hitungan **siapa transfer ke siapa berapa**, dengan jumlah transaksi sesedikit mungkin.

Dibuat tanpa login dan tanpa install: langsung jalan di browser, gratis.
## Live demo

Coba langsung di browser: [weinssy.github.io/split-bill-kelompok](https://weinssy.github.io/split-bill-kelompok/)

## Fitur

- Tambah/hapus peserta patungan
- Catat pengeluaran: nama, jumlah, siapa yang membayar, dan **pilih siapa saja yang ikut dibagi** (tidak harus semua orang)
- Saldo per orang: siapa kelebihan bayar, siapa kurang bayar
- **Penyelesaian otomatis**: algoritma greedy mencocokkan penyeimbang terbesar lebih dulu, jadi jumlah transfer seminimal mungkin
- Tombol **salin ringkasan** siap tempel ke WhatsApp
- Data tersimpan di browser (localStorage), jadi refresh halaman tidak menghilangkan hitungan
- Format uang Rupiah yang rapi, angka selalu rata digit seperti cetakan struk

## Cara pakai

1. Tambahkan nama semua peserta
2. Setiap ada yang membayar, catat pengeluarannya dan centang siapa saja yang ikut patungan
3. Lihat bagian "Siapa Transfer ke Siapa", ikuti daftar transfernya, selesai

## Contoh

Andi, Budi, dan Cici makan bareng. Andi membayar Rp150.000 untuk bertiga. Cici membayar parkir Rp10.000 untuk bertiga.

Hasilnya bukan semua orang transfer ke semua orang, tapi cukup 2 transfer: **Budi ke Andi Rp53.333** dan **Cici ke Andi Rp43.333**.

## Arah desain

Tampilannya mengikuti `DESIGN.md`: motif nota/struk kertas (garis putus-putus sebagai garis sobek, satu aksen hijau stempel "lunas"), dan lolos gerbang kualitas antislop.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript (tanpa framework, tanpa build step)
- localStorage untuk penyimpanan lokal

## Jalankan lokal

```
# dari folder proyek
python3 -m http.server 8000
# lalu buka http://localhost:8000 di browser
```

Atau cukup buka `index.html` langsung di browser.

## Struktur File

```
split-bill-kelompok/
├── index.html   # Halaman utama (form peserta, pengeluaran, hasil)
├── style.css    # Styling
├── script.js    # Logika patungan + penyelesaian hutang (inti logika tanpa DOM)
├── DESIGN.md    # Arah desain: motif nota, palet, tujuan tiap teknik
└── README.md
```

## Sengaja ditunda

- Mode patungan tidak rata (porsi berbeda per orang)
- Simpan beberapa acara patungan terpisah
- Sinkron antar perangkat / akun
- Bukti transfer

## Lisensi

MIT
