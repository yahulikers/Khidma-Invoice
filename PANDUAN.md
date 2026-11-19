# Khidma Invoice — Panduan (versi tim + database online)

Semua anggota tim memakai satu database: invoice yang dibuat satu orang langsung terlihat
dan bisa dikoreksi orang lain, dari web maupun HP.

## A. Siapkan Supabase (sekali saja, ±10 menit)
1. Daftar gratis di https://supabase.com → **New project** (region: Singapore). Catat password database.
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase/schema.sql`, klik **Run**.
   (Aman dijalankan ulang kapan saja.)
3. Buka **Authentication → Providers → Email**:
   - **matikan** "Allow new users to sign up" (agar orang luar tidak bisa daftar)
   - untuk mempermudah, matikan juga "Confirm email"
4. Buka **Authentication → Users → Add user → Create new user**. Isi email + password.
   **Akun yang dibuat PERTAMA otomatis menjadi ADMIN**, sisanya STAF. Buat akun admin Anda dulu.
5. Buka **Authentication → URL Configuration**: isi **Site URL** dengan alamat Vercel Anda
   (agar tautan "Lupa password" mengarah ke aplikasi).
6. Buka **Project Settings → API**. Salin **Project URL** dan **anon public key**.

## B. Hubungkan aplikasi
Buka `config.js`, ganti dua nilai tersebut, simpan. Lalu unggah ulang seluruh isi folder ke Vercel
(atau commit di GitHub → Vercel deploy otomatis).

## C. Menambah anggota tim
Supabase → Authentication → Users → Add user. Mereka otomatis berstatus STAF.
Jadikan admin: Table Editor → tabel `profiles` → ubah kolom `role` menjadi `admin`.

## Hak akses
|                                         | Admin | Staf |
|-----------------------------------------|:----:|:----:|
| Lihat semua invoice                     |  ✔   |  ✔   |
| Buat & koreksi invoice                  |  ✔   |  ✔   |
| Hapus invoice                           |  ✔   |  ✖   |
| Ubah pengaturan perusahaan/rekening/logo|  ✔   |  ✖   |
| Impor data lama dari versi sebelumnya   |  ✔   |  ✖   |
Aturan ini dijaga di database (bukan hanya di tampilan), jadi tidak bisa dilewati.

## Catatan
- Nomor invoice dibuat server saat disimpan → tidak bisa dobel walau dua orang menyimpan bersamaan.
- Jika dua orang mengedit invoice yang sama, yang menyimpan belakangan diberi peringatan
  (data orang pertama tidak tertimpa) dan diminta membuka ulang dari Riwayat.
- Butuh internet untuk login & menyimpan.
- Memakai data dari versi lama (tanpa database)? Login sebagai admin di perangkat yang sama →
  ⚙ Pengaturan → "Impor data lama".
- Ada perubahan kode? Naikkan `khidma-invoice-v2` di `sw.js` (v3, v4 …) agar HP memuat versi baru.
