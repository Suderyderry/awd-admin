/* Lapisan Supabase untuk panel admin Arjawinangun Delivery.
   - Login (Supabase Auth) + pemeriksaan tabel "admin"
   - Memuat data dari database ke panel
   - Menyimpan otomatis setiap perubahan (hanya baris yang berubah)
   - Pesanan baru muncul langsung lewat Realtime */
(() => {
  const cfg = window.SUPABASE_CONFIG || {};
  const q = s => document.querySelector(s);
  const chip = document.createElement('div');
  chip.style.cssText = 'position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:70;padding:4px 10px;border-radius:99px;font-size:12px;background:var(--sf);border:1px solid var(--bd);color:var(--mu)';
  document.body.append(chip);
  const setChip = (t, c) => { chip.textContent = t; chip.style.color = c || 'var(--mu)'; };
  if (!cfg.URL || !cfg.ANON_KEY || !window.supabase) { setChip('Mode demo – Supabase belum diatur (config.js)'); return; }

  const sb = window.supabase.createClient(cfg.URL, cfg.ANON_KEY);
  window.AWD_SB = sb; /* dipakai fitur Layanan/Tampilan/Hak akses menu di index.html */
  API.MOCK = false; API.req = async () => null; S.sim = false;

  const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : x);
  const PK = { pengguna: 'id', produk: 'id', pesanan: 'id', versi_aplikasi: 'tipe', spanduk: 'id', notifikasi: 'id', pesan_masuk: 'id', pengaturan: 'kunci' };
  const rowsAll = () => ({
    pengguna: D.map(r => ({ id: r.id, tipe: r.t, nama: r.name, status: r.s, data: r })),
    produk: Object.entries(PR).flatMap(([mid, a]) => a.map(p => ({ id: p.id, merchant_id: mid, data: p }))),
    pesanan: O.map(o => ({ id: o.id, status: o.s, total: o.p, data: o })),
    versi_aplikasi: V.map(v => ({ tipe: v.t, data: v })),
    spanduk: CMS.map((c, i) => ({ id: i + 1, data: c })),
    notifikasi: NT.map((n, i) => ({ id: i + 1, data: n })),
    pesan_masuk: INB.map(m => ({ id: m.id, data: m })),
    pengaturan: [{ kunci: 'sistem', data: SET }]
  });

  let admin = null, snap = {}, seen = new WeakSet(), busy = false, again = false, timer = 0, chan = null;

  /* ---------- Layar masuk ---------- */
  const lg = document.createElement('div');
  lg.style.cssText = 'position:fixed;inset:0;z-index:100;background:var(--bg);display:none;place-items:center;padding:16px';
  lg.innerHTML = '<div class="cd" style="width:min(380px,100%)"><img class="lg" alt="Arjawinangun Delivery" style="margin:0 auto 12px;max-width:120px"><h3 style="text-align:center;font-size:18px">Panel Admin</h3>'
    + '<label class="mu" for="lge">Email</label><input id="lge" type="email" autocomplete="username" style="width:100%">'
    + '<label class="mu" for="lgp" style="display:block;margin-top:8px">Kata sandi</label><input id="lgp" type="password" autocomplete="current-password" style="width:100%">'
    + '<p id="lgm" class="dg" role="alert" style="min-height:20px;margin:8px 0"></p><button class="btn pr" id="lgb" style="width:100%">Masuk</button></div>';
  document.body.append(lg);
  lg.querySelector('img').src = LOGO;
  const showLogin = msg => { lg.style.display = 'grid'; q('#lgm').textContent = msg || ''; q('#lgb').disabled = false; };
  const doLogin = async () => {
    q('#lgb').disabled = true; q('#lgm').textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({ email: q('#lge').value.trim(), password: q('#lgp').value });
    if (error) return showLogin('Email atau kata sandi salah.');
    await enter(data.user);
  };
  q('#lgb').onclick = doLogin;
  q('#lgp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  /* ---------- Muat data ---------- */
  const get = async (t, ord) => {
    let r = sb.from(t).select('*'); if (ord) r = r.order(ord[0], { ascending: ord[1] });
    const { data, error } = await r; if (error) throw error; return data;
  };
  const fill = (arr, rows) => { arr.length = 0; rows.forEach(r => arr.push(r.data)); };
  async function load(seedIfEmpty) {
    const [u, p, o, v, c, n, m, s] = await Promise.all([
      get('pengguna', ['urut', true]), get('produk', ['urut', true]), get('pesanan', ['urut', false]),
      get('versi_aplikasi'), get('spanduk', ['id', true]), get('notifikasi', ['id', true]),
      get('pesan_masuk', ['urut', false]), get('pengaturan')]);
    const empty = new Set();
    if (!u.length && seedIfEmpty) {
      ['pengguna', 'produk', 'pesanan', 'spanduk', 'notifikasi', 'pesan_masuk'].forEach(t => empty.add(t));
    } else if (!u.length) {
      D.length = 0; O.length = 0; CMS.length = 0; NT.length = 0; INB.length = 0; Object.keys(PR).forEach(k => delete PR[k]);
    } else {
      fill(D, u); fill(O, o); fill(CMS, c); fill(NT, n); fill(INB, m);
      Object.keys(PR).forEach(k => delete PR[k]); p.forEach(r => (PR[r.merchant_id] = PR[r.merchant_id] || []).push(r.data));
    }
    D.filter(r => r.t == 'merchant').forEach(r => PR[r.id] = PR[r.id] || []);
    if (v.length) { const ord = ['merchant', 'driver', 'customer']; V.length = 0; v.sort((a, b) => ord.indexOf(a.tipe) - ord.indexOf(b.tipe)).forEach(r => V.push(r.data)); } else empty.add('versi_aplikasi');
    const sistem = s.find(r => r.kunci === 'sistem'); /* tabel pengaturan juga memuat kunci lain (layanan, tampilan, dst.) */
    if (sistem) Object.assign(SET, sistem.data); else empty.add('pengaturan');
    seq = D.reduce((a, r) => Math.max(a, parseInt(r.id.slice(1)) || 0), 0) + 1;
    pq = Object.values(PR).flat().reduce((a, r) => Math.max(a, parseInt(String(r.id).slice(1)) || 0), 0) + 1;
    snap = {}; const now = rowsAll();
    for (const t in now) if (!empty.has(t)) snap[t] = new Map(now[t].map(r => [String(r[PK[t]]), stable(r)]));
    const { data: au } = await sb.from('log_audit').select('peran,jam,aksi').order('id', { ascending: false }).limit(100);
    S.au.length = 0; (au || []).forEach(a => { const e = { t: a.jam, u: a.peran, m: a.aksi }; seen.add(e); S.au.push(e); });
  }

  /* ---------- Simpan otomatis ---------- */
  const schedule = (ms = 800) => { clearTimeout(timer); timer = setTimeout(flush, ms); };
  async function flush() {
    if (!admin) return;
    if (busy) { again = true; return; }
    busy = true; setChip('Menyimpan…');
    try {
      const now = rowsAll();
      for (const t in now) {
        const key = PK[t], cur = new Map(now[t].map(r => [String(r[key]), r])), old = snap[t] || new Map(), next = new Map(), up = [];
        for (const [k, r] of cur) { const j = stable(r); next.set(k, j); if (old.get(k) !== j) up.push(r); }
        const gone = [...old.keys()].filter(k => !cur.has(k));
        for (let i = 0; i < up.length; i += 50) { const { error } = await sb.from(t).upsert(up.slice(i, i + 50), { onConflict: key }); if (error) throw error; }
        if (gone.length) { const { error } = await sb.from(t).delete().in(key, gone); if (error) throw error; }
        snap[t] = next;
      }
      const fresh = S.au.filter(a => !seen.has(a));
      if (fresh.length) {
        const { error } = await sb.from('log_audit').insert([...fresh].reverse().map(a => ({ admin_id: admin.id, peran: a.u, jam: a.t, aksi: a.m })));
        if (error) throw error; fresh.forEach(a => seen.add(a));
      }
      setChip('Tersimpan ✓');
    } catch (e) {
      console.error(e);
      if (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) {
        toast('Perubahan ditolak: peran Anda tidak punya izin'); setChip('Perubahan ditolak', 'var(--rd)');
        try { await load(false); render(); renderBell(); } catch (_) {}
      } else { setChip('Gagal menyimpan – mencoba lagi', 'var(--rd)'); setTimeout(() => schedule(0), 8000); }
    }
    busy = false; if (again) { again = false; schedule(300); }
  }
  ['click', 'change', 'input'].forEach(ev => document.addEventListener(ev, () => schedule(), false));
  setInterval(() => schedule(0), 15000);

  /* ---------- Pesanan baru (Realtime) ---------- */
  function listen() {
    if (chan) sb.removeChannel(chan);
    chan = sb.channel('pesanan-live').on('postgres_changes', { event: '*', schema: 'public', table: 'pesanan' }, p => {
      const r = p.new; if (!r || !r.id) return;
      const o = r.data, i = O.findIndex(x => x.id == r.id);
      if (i < 0) { O.unshift(o); if (o.s == 'Baru') notifyOrder(o, 'baru'); else if (S.p == 'orders') render(); }
      else if (stable(O[i]) !== stable(o)) { O[i] = o; if (S.p == 'orders' && !q('#ov').classList.contains('on')) render(); }
      if (snap.pesanan) snap.pesanan.set(String(r.id), stable({ id: r.id, status: r.status, total: r.total, data: o }));
    }).subscribe();
  }

  /* ---------- Masuk / keluar ---------- */
  async function enter(user) {
    const { data, error } = await sb.from('admin').select('nama,peran').eq('user_id', user.id).maybeSingle();
    if (error || !data) { await sb.auth.signOut(); return showLogin('Akun ini bukan admin. Hubungi Admin Utama.'); }
    admin = { ...data, id: user.id };
    try {
      let seed = false;
      const { count } = await sb.from('pengguna').select('id', { count: 'exact', head: true });
      if (!count && admin.peran == 'Admin Utama') seed = confirm('Database masih kosong.\n\nIsi dengan data contoh (toko, driver, pelanggan, pesanan) agar panel bisa langsung dicoba?\n\nOK = isi data contoh, Batal = mulai dari kosong.');
      await load(seed);
    } catch (e) { admin = null; return showLogin('Gagal memuat data: ' + (e.message || e)); }
    S.role = admin.peran; const rl = q('#rl'); rl.value = admin.peran; rl.disabled = true;
    lg.style.display = 'none';
    log('Masuk ke panel admin'); render(); renderBell(); sbr();
    listen(); schedule(0);
    document.dispatchEvent(new Event('awd-login'));
  }
  const lo = document.createElement('button');
  lo.className = 'btn'; lo.textContent = 'Keluar'; lo.setAttribute('aria-label', 'Keluar dari panel');
  q('header').insertBefore(lo, q('#rl'));
  lo.onclick = async () => { await flush(); if (chan) sb.removeChannel(chan); await sb.auth.signOut(); admin = null; location.reload(); };

  (async () => {
    setChip('Menyambung…');
    const { data: { session } } = await sb.auth.getSession();
    if (session) { lg.style.display = 'grid'; await enter(session.user); } else showLogin();
    setChip(admin ? 'Tersimpan ✓' : '');
  })();
})();
