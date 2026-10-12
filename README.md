# Agent Desk

Agent Desk adalah kantor virtual 3D untuk 282 agen AI dari repo [The Agency](https://github.com/msitarzewski/agency-agents). Tim Anda berjalan di gedung 2 lantai, menjelajahi agen, mengobrol 1-on-1, dan mengirim tugas yang dibahas para lead divisi di Ruang Rapat. Keputusan akhir selalu di tangan pemberi tugas.

## Fitur

- **Gedung 2 lantai** (3D low-poly): Lantai 1 berisi lobby, Meja Tugas, Ruang Rapat, dan divisi bisnis. Lantai 2 berisi Engineering, Game, GIS, Security, dan divisi lain. Pindah lantai lewat tangga atau tombol lift.
- **282 tokoh agen** duduk di mejanya. Klik tokoh untuk melihat profil, prompt lengkap, label kualitas & wilayah, serta deskripsi Bahasa Indonesia.
- **Meja Tugas → Rapat → Review**
  1. Kirim tugas di Meja Tugas (lobby, tekan `E`) atau lewat tombol 📥.
  2. Pilih peserta: otomatis oleh Agents Orchestrator, atau tentukan sendiri divisi/agennya.
  3. Lead tiap divisi berjalan ke Ruang Rapat, lalu berdiskusi bergiliran. Transkripnya tampil langsung.
  4. Orchestrator menyusun usulan akhir. Anda memutuskan: **Setujui**, **Minta revisi** (rapat dilanjutkan dengan catatan Anda), atau **Tolak**.
- **Chat 1-on-1** dengan agen mana pun, dengan riwayat yang tersimpan.
- **Claude atau GPT**, dipilih per tugas atau per percakapan. Agen selalu menjawab dalam Bahasa Indonesia.
- **Akun tim**: hanya admin yang membuat akun (menu *Kelola tim*).

## Menjalankan di komputer lokal

Butuh Node.js 22.13 atau lebih baru.

```bash
npm install
cp .env.example .env.local     # lalu isi ADMIN_PASSWORD dan API key
npm run dev                    # buka http://localhost:3000
```

Untuk mencoba alurnya tanpa API key, set `LLM_MOCK=1` di `.env.local`.

## Deploy ke VPS (Docker)

1. Salin folder proyek ini ke VPS, misalnya `/opt/agency-office`.
2. Buat file `.env` dari `.env.example`, lalu isi `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` dan/atau `OPENAI_API_KEY`.
   - Punya domain: isi `SITE_ADDRESS=office.domainanda.com`, arahkan DNS ke IP VPS, dan set `COOKIE_SECURE=true`. HTTPS akan aktif otomatis.
   - Belum punya domain: biarkan `SITE_ADDRESS` kosong dan akses lewat `http://IP-VPS`.
   - Port 80/443 sudah dipakai layanan lain: ubah `HTTP_PORT`/`HTTPS_PORT`.
3. Jalankan:

```bash
docker compose up -d --build
docker compose logs -f app
```

Database SQLite disimpan di volume Docker `office-data`. Cadangkan dengan:

```bash
docker compose cp app:/app/storage/office.db ./backup-office.db
```

## Memperbarui daftar agen

Data agen ada di `data/agents.json` dan `data/agent-bodies.json`. Keduanya dibuat dari repo agency-agents:

```bash
AGENCY_SOURCE=../agency-agents-main npm run import-agents
```

Terjemahan Indonesia diambil dari `data/translations-id.json`. Agen baru yang belum punya terjemahan tetap tampil dengan deskripsi berbahasa Inggris.

## Mengatur lead divisi

`data/leads.json` menentukan agen mana yang mewakili tiap divisi di rapat (`leads`) dan siapa yang memimpin rapat (`chair`). Ubah ID agennya, lalu restart aplikasi.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/components/office/` | Kantor 3D (gedung, tokoh, animasi, rapat) dan antarmuka |
| `src/lib/meeting.ts` | Jalannya rapat: pemilihan peserta, giliran bicara, usulan akhir |
| `src/lib/llm/` | Koneksi ke Claude (Anthropic SDK), GPT (OpenAI SDK), dan mode simulasi |
| `src/app/api/` | API: login, akun, tugas (dengan aliran event langsung), chat |
| `data/` | Data agen, terjemahan, dan konfigurasi lead |
