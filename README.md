# Arjawinangun Delivery – Panel Admin

Panel admin (HTML + JavaScript) yang tersambung ke database **Supabase** dan dipublikasikan lewat **GitHub Pages**.

## Isi proyek
| File | Fungsi |
|---|---|
| `index.html` | Aplikasi panel admin (tampilan asli Anda) |
| `supabase-layer.js` | Login, muat data, simpan otomatis, notifikasi pesanan realtime |
| `config.js` | Tempat mengisi URL & anon key Supabase |
| `supabase/schema.sql` | Tabel + keamanan (RLS) database |
| `.github/workflows/pages.yml` | Deploy otomatis ke GitHub Pages |

## Langkah 1 – Buat proyek Supabase
1. Daftar di https://supabase.com lalu **New project** (pilih region terdekat, mis. Singapore). Simpan *database password*.
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase/schema.sql`, klik **Run**.
3. Buka **Project Settings → Data API** untuk menyalin **Project URL**, lalu **Project Settings → API Keys** untuk menyalin **Publishable key** (`sb_publishable_...`). Jika belum ada, klik **Create new API Keys**; atau pakai **anon** dari tab **Legacy API Keys**.

## Langkah 2 – Buat akun admin pertama
1. **Authentication → Users → Add user → Create new user** (isi email + kata sandi, centang *Auto Confirm User*).
2. Di SQL Editor, jadikan akun itu admin:
```sql
insert into public.admin (user_id, nama, peran)
select id, 'Nama Anda', 'Admin Utama' from auth.users where email = 'email-anda@contoh.com';
```
Peran yang tersedia: `Admin Utama`, `Operator`, `Layanan Pelanggan`.
3. (Disarankan) **Authentication → Providers → Email**: matikan *Allow new users to sign up* agar orang lain tidak bisa mendaftar sendiri.

## Langkah 3 – Isi konfigurasi
Edit `config.js`, isi `URL` dan `ANON_KEY` dari Langkah 1. (Kunci *anon* memang publik; datanya dilindungi RLS. **Jangan** pernah memakai kunci `service_role` di sini.)

## Langkah 4 – Unggah ke GitHub
```bash
git init
git add .
git commit -m "Panel admin Arjawinangun Delivery"
git branch -M main
git remote add origin https://github.com/USERNAME/arjawinangun-delivery-admin.git
git push -u origin main
```
(Buat dulu repositori kosong di github.com → **New repository**.) Tanpa Git di komputer, bisa lewat **Add file → Upload files** di halaman repositori.

## Langkah 5 – Aktifkan GitHub Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions**. Setiap `git push` ke `main` akan otomatis di-deploy. Alamatnya: `https://USERNAME.github.io/arjawinangun-delivery-admin/`.

## Langkah 6 – Izinkan alamat situs di Supabase
**Authentication → URL Configuration → Site URL**: isi alamat GitHub Pages Anda.

## Langkah 7 – Pakai
Buka alamat situs, masuk dengan akun admin. Jika database masih kosong, Admin Utama akan ditawari mengisi **data contoh**. Setelah itu setiap perubahan tersimpan otomatis (indikator di kiri bawah).

## Catatan penting
- **Pembagian peran** ditegakkan di database (RLS): Layanan Pelanggan hanya baca (dan balas pesan), Operator boleh tambah/ubah, hanya Admin Utama yang boleh hapus.
- **Foto/gambar** saat ini tersimpan di database sebagai teks (data URI). Untuk skala besar, pindahkan ke **Supabase Storage**.
- **Data sensitif** (KTP, SIM, rekening) hanya terbaca admin lewat RLS, tetapi sebaiknya dienkripsi/dipindah ke Storage privat sebelum dipakai sungguhan.
- **Aplikasi Android** (toko, driver, pelanggan) nanti memakai proyek Supabase yang sama dengan kebijakan RLS sendiri. Pesanan yang ditulis aplikasi pelanggan ke tabel `pesanan` (kolom `data` berbentuk `{id,c,m,d,s,p}`) akan langsung muncul di panel sebagai notifikasi.
- Struktur tabel saat ini sengaja ringkas (kolom kunci + `data` jsonb). Rancangan tabel lengkap ada di menu **Rancangan Database** pada panel, dan bisa dinormalisasi bertahap.
