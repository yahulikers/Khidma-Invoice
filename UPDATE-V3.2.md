# Update v3.2 — deskripsi turun baris & rata kanan, logo baru, tanda tangan default

File yang berubah (5):
1. `css/invoice.css`   → kolom DESCRIPTION: teks panjang otomatis turun ke baris baru, rata kanan
2. `js/logo-data.js`  → logo baru + tanda tangan baru (default)
3. `js/app.js`        → tanda tangan default memakai tanda tangan baru
4. `assets/logo.png`  → logo di halaman login
5. `sw.js`            → naikkan versi cache supaya HP/PC memuat file baru

## Pasang lewat GitHub (tanpa Supabase)
1. Buka repo di GitHub → **Add file → Upload files**.
2. Seret isi folder zip (struktur folder `css`, `js`, `assets` harus sama), centang ganti file lama.
3. **Commit changes**. Vercel otomatis deploy (±1 menit, tunggu "Ready").
4. Buka aplikasi → tekan **Ctrl+Shift+R** (HP: tutup aplikasi lalu buka lagi / hapus cache).

## Supabase: tidak perlu diubah
Tidak ada perubahan database maupun Edge Function.
Jika sebelumnya Anda pernah mengunggah logo/tanda tangan sendiri di **Pengaturan**, gambar itu
tersimpan di database dan mengalahkan default. Buka **Pengaturan → Logo → Hapus**, dan
**Tanda tangan → Hapus**, lalu **Simpan**. Setelah itu logo & TTD baru dipakai.

## Mengubah sendiri nanti
- Lebar kolom Description: `js/app.js`, baris `<colgroup>` (`33%`), kurangi kolom lain bila ingin lebih lebar.
- Rata teks: `css/invoice.css`, `.inv-tbl td.c2` → `text-align:right` (ganti `left`/`center`).
- Ukuran logo header: `.inv-logo img{height:80px}`; ukuran TTD: `.inv-sign img{height:62px}`.
