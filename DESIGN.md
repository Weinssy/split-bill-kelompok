# Arah Desain: Nota Patungan

Split Bill adalah alat hitung, bukan landing page. Arahnya diambil dari benda yang paling dekat dengan isinya: **struk/nota kertas** di atas meja warung.

- **Motif identitas:** lembaran nota. Kartu putih berbatas tegas (`#DDD5C3`) di atas latar kertas krem (`#F6F4EF`), garis putus-putus sebagai garis sobek antar bagian nota, dan angka uang selalu rata digit (tabular) seperti cetakan struk.
- **Palet:** tinta hitam hangat (`#23201A`) dan teks sekunder (`#5D5747`, 7.19:1 di `#FFFFFF`, 6.54:1 di `#F6F4EF`) di atas kertas krem, border kontrol `#8A816B` (3.87:1 di `#FFFFFF`), satu aksen hijau (`#176534`, warna tinta stempel "lunas", 7.12:1 dengan teks putih) untuk hasil akhir dan status kelebihan bayar. Merah (`#9C2B1F` / `#B03A2E`) hanya untuk status kurang bayar dan pesan error.
- **Tipografi:** font sistem (`font-size: max(1rem, 1em)` pada input agar tidak auto-zoom di perangkat mobile), tanpa font dekoratif. Yang berkarakter adalah angka Rupiahnya: selalu tabular dan tebal di baris hasil.
- **Dials:** `ENERGY 2 / RHYTHM 2 / MOTION 1`. Alat yang dipakai sambil makan harus tenang dan cepat dipindai; tidak ada animasi selain status tombol dan dimatikan di bawah `prefers-reduced-motion: reduce`.
- **Tujuan tiap teknik:**
  - Kartu (`container: receipt / inline-size`) = satu tahap nota (judul, peserta, pengeluaran, hasil), bukan dekorasi.
  - Garis putus-putus = pemisah tahap, meniru garis sobek struk.
  - Chip peserta = label nama yang bisa dihapus langsung, dengan area sentuh minimal 44x44px dan dialog konfirmasi `<dialog>` native.
  - Panah "→" di daftar transfer = arah uang bergerak, dilengkapi penanda status `Lunas` per transfer.
