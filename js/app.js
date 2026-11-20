(() => {
'use strict';
const $ = id => document.getElementById(id);
const K = { inv: 'khidma_invoice_history_v1', set: 'khidma_invoice_settings_v1' }; // kunci lama, hanya untuk impor

/* ---------- util ---------- */
const clone = v => JSON.parse(JSON.stringify(v));
function load(storage, key, fb) { try { const v = storage.getItem(key); return v ? JSON.parse(v) : clone(fb); } catch (e) { return clone(fb); } }
function save(storage, key, val) { try { storage.setItem(key, JSON.stringify(val)); return true; } catch (e) { toast('Penyimpanan penuh / tidak tersedia.'); return false; } }
const L = (k, fb) => load(localStorage, k, fb), S = (k, v) => save(localStorage, k, v);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
let toastT; function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 3000); }
const MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MON_L = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function parts(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? { y: m[1], m: +m[2] - 1, d: m[3] } : null; }
const dShort = iso => { const p = parts(iso); return p ? `${p.d}-${MON_S[p.m]}-${p.y}` : ''; };      // 24-Des-2026
const dLong = iso => { const p = parts(iso); return p ? `${+p.d} ${MON_L[p.m]} ${p.y}` : ''; };      // 24 November 2026
const num = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const idr = n => 'IDR ' + num(n);

/* ---------- Supabase & auth ---------- */
const CFG = window.KHIDMA_CONFIG || {};
const configured = !!(window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/PASTE_/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY));
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const arrivedByRecovery = /type=recovery/.test(location.hash + location.search);
let me = null, role = 'staff', perms = {}, profile = null;
const isAdmin = () => role === 'admin';
const can = p => isAdmin() || !!perms[p];                       // hak akses ditentukan admin per pengguna
const LOGIN_DOMAIN = String(CFG.LOGIN_DOMAIN || 'khidma.app').toLowerCase();
const toEmail = v => { v = String(v || '').trim(); return v.includes('@') ? v : v.toLowerCase() + '@' + LOGIN_DOMAIN; };   // User ID → email internal
const uid = e => String(e || '').split('@')[0];
function errMsg(e) {
  const m = String((e && e.message) || e || '');
  if (/Invalid login/i.test(m)) return 'User ID atau password salah.';
  if (/banned|user is disabled/i.test(m)) return 'Akun Anda dinonaktifkan. Hubungi admin.';
  if (/Requested function was not found|Failed to send a request to the Edge Function|FunctionsFetchError/.test(m)) return 'Fungsi admin-users belum dipasang di Supabase. Ikuti PANDUAN.md bagian "Pasang fungsi admin-users".';
  if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Hubungi admin.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Tidak ada koneksi internet.';
  if (/schema cache|does not exist|42P01|PGRST205/i.test(m)) return 'Database belum disiapkan. Jalankan supabase/schema.sql di Supabase.';
  if (/same password|different from the old/i.test(m)) return 'Password baru harus berbeda dari yang lama.';
  if (/row-level security|permission denied/i.test(m)) return 'Anda tidak punya izin untuk tindakan ini.';
  return m || 'Terjadi kesalahan.';
}
function showAlert(id, msg, cls) { const e = $(id); e.textContent = msg; e.className = 'alert ' + (cls || 'err') + (msg ? '' : ' hidden'); }
function authPanel(which) { ['loginForm', 'forgotForm', 'resetForm', 'configMissing'].forEach(i => $(i).classList.toggle('hidden', i !== which)); }
function showAuth(which) { $('authScreen').classList.remove('hidden'); $('appShell').classList.add('hidden'); authPanel(which); }
async function logout() {
  me = null;
  // 1) minta server mencabut sesi (maks. 3 detik), 2) APAPUN hasilnya hapus sesi yang tersimpan di browser
  try { await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { }
  try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { }
  try { Object.keys(sessionStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => sessionStorage.removeItem(k)); } catch (e) { }
  location.reload();
}

async function bootAuth() {
  document.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => { const i = $(b.dataset.eye); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Tutup' : 'Lihat'; }));
  if (!configured) return showAuth('configMissing');
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') showAuth('resetForm');
    if (ev === 'SIGNED_OUT' && me) location.reload();
  });
  let session = null;
  try { session = (await sb.auth.getSession()).data.session; } catch (e) { }
  if (arrivedByRecovery) return showAuth('resetForm');
  if (session) return enterApp(session.user);
  showAuth('loginForm');
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('loginBtn'); btn.disabled = true; showAlert('loginAlert', '');
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: toEmail($('lUser').value), password: $('lPass').value });
    if (error) throw error; $('lPass').value = ''; await enterApp(data.user);
  } catch (err) { showAlert('loginAlert', errMsg(err)); }
  btn.disabled = false;
});
$('toForgot').addEventListener('click', () => authPanel('forgotForm'));
$('toLogin').addEventListener('click', () => authPanel('loginForm'));
$('resetForm').addEventListener('submit', async e => {
  e.preventDefault(); const n = $('rPass').value;
  if (n.length < 8) return showAlert('resetAlert', 'Password minimal 8 karakter.');
  try {
    const { data, error } = await sb.auth.updateUser({ password: n }); if (error) throw error;
    history.replaceState(null, '', location.pathname); $('rPass').value = ''; await enterApp(data.user);
  } catch (err) { showAlert('resetAlert', errMsg(err)); }
});

/* ---------- settings ---------- */
const DEF = {
  company: 'PT. KHIDMA GROUP WISATA', address: 'Jl. Lintas Selatan, Pracimantoro,\nGiritontro, Wonogiri.', phone: '081326984250', email: 'elanurismayahya.iw@gmail.com',
  bankName: 'Bank Mandiri', accounts: [{ bank: 'Bank Mandiri', name: 'PT KHIDMA GROUP WISATA', number: '1380028269434' }, { bank: 'Bank Mandiri', name: 'IRFANI WAKHID', number: '1380022284322' }],
  signer: 'IRFANI WAKHID', place: 'Wonogiri', note: 'Harga Tersebut Tidak Mengikat, Mengikuti Regulasi Maskapai.',
  logoData: '', signatureData: '', signatureAlign: 'start'
};
let settings = clone(DEF); // dimuat dari database setelah login
const LOGO = () => settings.logoData || window.KHIDMA_LOGO;
const SIG = () => settings.signatureData || window.KHIDMA_LOGO;

/* ---------- invoice html ---------- */
const PAYLBL = i => i === 0 ? 'DP' : i === 10 ? 'PELUNASAN' : i < 10 ? 'Payment ' + i : '';
function calc(d) {
  const total = d.items.reduce((s, i) => s + i.qty * i.price, 0), paid = d.payments.reduce((s, p) => s + p.amount, 0);
  return { total, paid, due: total - paid, status: paid > total ? 'over' : (paid === total && total > 0 ? 'paid' : 'unpaid') };
}
function invoiceHTML(d, st, number) {
  const c = calc(d), up = s => esc(String(s || '').toUpperCase());
  const rows = Math.max(4, d.items.length); let it = '';
  for (let i = 0; i < rows; i++) {
    const x = d.items[i], has = x && (x.date || x.description || x.qty > 0 || x.price > 0);
    it += `<tr class="${i % 2 ? 'b' : ''}"><td>${has ? esc(dShort(x.date)) : ''}</td><td class="c2">${has ? esc(x.description) : ''}</td><td>${has && x.qty ? x.qty : ''}</td><td class="c4 mn">${has ? `<div class="inv-m"><span>IDR</span><span>${num(x.price)}</span></div>` : ''}</td><td class="mn last">${has ? `<div class="inv-m"><span>IDR</span><span>${num(x.qty * x.price)}</span></div>` : ''}</td></tr>`;
  }
  const pr = Math.max(11, d.payments.length); let pay = '';
  for (let i = 0; i < pr; i++) {
    const p = d.payments[i], has = p && (p.date || p.amount > 0 || p.description);
    pay += `<tr><td class="p1">${p && p.date ? esc(dShort(p.date)) : ''}</td><td class="p2">${esc((p && p.description) || PAYLBL(i))}</td><td class="p3">${p && p.amount > 0 ? `<div class="inv-m"><span>IDR</span><span>${num(p.amount)}</span></div>` : ''}</td></tr>`;
  }
  const dueRow = c.due < 0 ? ['LEBIH BAYAR :', `<span>IDR</span><span>${num(-c.due)}</span>`, ''] : (c.due === 0 && c.total > 0) ? ['STATUS :', 'LUNAS', ' txt'] : ['KURANG BAYAR :', `<span>IDR</span><span>${num(c.due)}</span>`, ''];
  const accs = (st.accounts || []).filter(a => a.name || a.number);
  const defBank = (st.bankName || 'Bank Mandiri').trim(), groups = [];            // kelompokkan rekening per bank
  accs.forEach(a => { const b = String(a.bank || defBank).trim() || defBank; let g = groups.find(x => x.b.toLowerCase() === b.toLowerCase()); if (!g) { g = { b, list: [] }; groups.push(g); } g.list.push(a); });
  const bankHTML = groups.map((g, gi) => `<div class="bk${gi ? ' gap' : ''}"><div class="r"><div class="n">${esc(g.b)}</div><div class="h">No. REK</div></div>${g.list.map(a => `<div class="r"><div class="n">a.n ${esc(a.name)}</div><div>: ${esc(a.number)}</div></div>`).join('')}</div>`).join('');
  const al = ['start', 'center', 'end'].includes(st.signatureAlign) ? st.signatureAlign : 'start';
  const logo = st.logoData || window.KHIDMA_LOGO, sig = st.signatureData || window.KHIDMA_LOGO;
  const place = dLong(d.invoiceDate || todayISO());
  return `<div class="inv">
<div class="inv-head"><div class="inv-logo"><img src="${logo}" alt=""></div><div class="inv-co">${esc(st.company)}</div><div class="inv-ct">${esc([st.address, st.phone, st.email].filter(Boolean).join('\n'))}</div></div>
<div class="inv-meta"><div class="l">No. Invoice</div><div>: ${esc(number)}</div><div class="l">Bill to</div><div>: ${up(d.billTo)}</div><div class="l">Hal</div><div>: ${up(d.subject)}</div><div class="l">Program</div><div>: ${up(d.program)}</div><div class="l">Deadline</div><div>: ${esc(dLong(d.deadline))}</div></div>
<table class="inv-tbl"><colgroup><col style="width:21%"><col style="width:33%"><col style="width:8%"><col style="width:19%"><col style="width:19%"></colgroup>
<thead><tr><th>DATE OF TRAVEL</th><th class="c2">DESCRIPTION</th><th>QTY</th><th class="c4">PRICE</th><th>TOTAL</th></tr></thead><tbody>${it}</tbody></table>
<div class="inv-bottom">
<div class="inv-left"><div class="inv-cap">Payment dapat dibayarkan ke :</div>
<div class="inv-bank">${bankHTML}</div>
<div class="inv-note">Note : ${esc(st.note)}</div>
<div class="inv-sign ${al === 'start' ? '' : al}"><div>${esc(st.place)}, ${esc(place)}</div><img src="${sig}" alt=""><div class="sn">${esc(st.signer)}</div></div></div>
<div class="inv-right"><div class="inv-tot"><span class="lb">TOTAL TAGIHAN :</span><span class="mm"><span>IDR</span><span>${num(c.total)}</span></span></div>
<div class="inv-pt">Rincian Pembayaran :</div>
<table class="inv-pay"><thead><tr><th>TF DATE</th><th>DESC</th><th>PAYMENT</th></tr></thead><tbody>${pay}</tbody></table>
<div class="inv-sum"><span class="lb">TOTAL PAYMENT :</span><span class="mm"><span>IDR</span><span>${num(c.paid)}</span></span></div>
<div class="inv-sum due"><span class="lb">${dueRow[0]}</span><span class="mm${dueRow[2]}">${dueRow[1]}</span></div></div>
</div></div>`;
}

/* ---------- form ---------- */
let curId = null, curNo = null;
const pref = t => t === 'HJI' ? 'HJI' : t === 'LAIN' ? 'INV' : 'UMR';
const previewNo = (t, date) => `INV/${pref(t)}/${(date || todayISO()).slice(0, 4)}/###`; // nomor resmi dibuat server saat disimpan
let curUpdated = null, saving = false;

function addItem(x = {}) {
  const r = document.createElement('div'); r.className = 'row item';
  r.innerHTML = `<div class="tag">Item tagihan</div><button type="button" class="rm" aria-label="Hapus">×</button>
<div><label>Tgl. Travel</label><input type="date" class="i-date" value="${esc(x.date || '')}"></div>
<div><label>Qty</label><input type="number" inputmode="numeric" class="i-qty" min="1" step="1" value="${esc(x.qty ?? 1)}"></div>
<div class="full"><label>Description *</label><input class="i-desc" placeholder="Contoh: Lion Air Jakarta - Jeddah" value="${esc(x.description || '')}"></div>
<div class="full"><label>Price (IDR)</label><input type="number" inputmode="numeric" class="i-price" min="0" step="1000" placeholder="0" value="${esc(x.price ?? '')}"></div>`;
  wireRow(r); $('itemsList').appendChild(r); reTag();
}
function addPay(x = {}) {
  const r = document.createElement('div'); r.className = 'row pay';
  r.innerHTML = `<div class="tag">Pembayaran</div><button type="button" class="rm" aria-label="Hapus">×</button>
<div><label>Tanggal transfer</label><input type="date" class="p-date" value="${esc(x.date || '')}"></div>
<div><label>Payment (IDR)</label><input type="number" inputmode="numeric" class="p-amt" min="0" step="1000" placeholder="0" value="${esc(x.amount ?? '')}"></div>
<div style="grid-column:1/-1"><label>Desc (opsional)</label><input class="p-desc" placeholder="DP / Payment 1 / PELUNASAN" value="${esc(x.description || '')}"></div>`;
  wireRow(r); $('paysList').appendChild(r); reTag();
}
function wireRow(r) { r.querySelectorAll('input').forEach(i => i.addEventListener('input', update)); r.querySelector('.rm').addEventListener('click', () => { r.remove(); reTag(); update(); }); }
function reTag() {
  $('itemsList').querySelectorAll('.tag').forEach((t, i) => t.textContent = 'Item tagihan #' + (i + 1));
  $('paysList').querySelectorAll('.tag').forEach((t, i) => t.textContent = 'Pembayaran #' + (i + 1) + (PAYLBL(i) ? ' · ' + PAYLBL(i) : ''));
}
function read() {
  return {
    type: $('fType').value, invoiceDate: $('fDate').value, deadline: $('fDeadline').value, billTo: $('fBill').value.trim(), subject: $('fSubject').value.trim(), program: $('fProgram').value.trim(),
    items: [...$('itemsList').children].map(r => ({ date: r.querySelector('.i-date').value, description: r.querySelector('.i-desc').value.trim(), qty: Math.max(0, Number(r.querySelector('.i-qty').value) || 0), price: Math.max(0, Number(r.querySelector('.i-price').value) || 0) })),
    payments: [...$('paysList').children].map(r => ({ date: r.querySelector('.p-date').value, description: r.querySelector('.p-desc').value.trim(), amount: Math.max(0, Number(r.querySelector('.p-amt').value) || 0) }))
  };
}
function fit() {
  const box = $('pvBox'), sc = $('pvScale'), paper = $('pvPaper'); if (!box.clientWidth) return;
  const s = Math.min(1, box.clientWidth / 800);
  sc.style.transform = `scale(${s})`; sc.style.width = '800px'; box.style.height = Math.ceil(paper.offsetHeight * s) + 'px';
}
function update() {
  const d = read(), c = calc(d), no = curNo || previewNo(d.type, d.invoiceDate);
  $('fNumber').value = no;
  $('pvPaper').innerHTML = invoiceHTML(d, settings, no);
  $('tTotal').textContent = idr(c.total); $('tPaid').textContent = idr(c.paid);
  $('tDueL').textContent = c.due < 0 ? 'Lebih bayar' : (c.due === 0 && c.total > 0 ? 'Status' : 'Kurang bayar');
  $('tDue').textContent = c.due < 0 ? idr(-c.due) : (c.due === 0 && c.total > 0 ? 'LUNAS' : idr(c.due));
  requestAnimationFrame(fit);
}
function validate() {
  const d = read(); if (!d.invoiceDate) return toast('Tanggal invoice wajib diisi.'), $('fDate').focus(), false;
  if (!d.billTo) return toast('Nama pelanggan wajib diisi.'), $('fBill').focus(), false;
  if (!d.program) return toast('Program / paket wajib diisi.'), $('fProgram').focus(), false;
  if (!d.items.some(i => i.description && i.qty > 0)) return toast('Isi minimal satu item tagihan (description & qty).'), false;
  if (calc(d).due < 0) return toast('Total pembayaran melebihi total tagihan. Periksa nominal.'), false;
  return true;
}
function snapshotSettings() { const s = clone(settings); delete s.logoData; delete s.signatureData; return s; }
const mapRow = r => ({ id: r.id, number: r.number, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by_email, updatedBy: r.updated_by_email, data: r.data, settings: r.settings, calc: calc(r.data) });
async function saveInvoice() {
  if (saving || !validate()) return null;
  if (!curId && !can('create')) { toast('Anda tidak punya izin membuat invoice baru.'); return null; }
  if (curId && !can('edit')) { toast('Anda tidak punya izin mengoreksi invoice.'); return null; }
  saving = true; document.body.style.cursor = 'progress';
  const d = read(), c = calc(d);
  const row = { type: d.type, invoice_date: d.invoiceDate || null, bill_to: d.billTo, program: d.program, total: c.total, paid: c.paid, status: c.status, data: d, settings: snapshotSettings() };
  try {
    let r;
    if (!curId) { r = await sb.from('invoices').insert(row).select().single(); if (r.error) throw r.error; }
    else {
      r = await sb.from('invoices').update(row).eq('id', curId).eq('updated_at', curUpdated).select();
      if (r.error) throw r.error;
      if (!r.data.length) { toast('Invoice ini sudah diubah orang lain atau dihapus. Buka ulang dari Riwayat untuk versi terbaru.'); return null; }
      r.data = r.data[0];
    }
    const rec = mapRow(r.data); curId = rec.id; curNo = rec.number; curUpdated = rec.updatedAt;
    $('pageTitle').textContent = 'Edit ' + curNo; update(); fetchInvoices().then(renderHist).catch(() => { }); return rec;
  } catch (e) { console.error(e); toast('Gagal menyimpan: ' + errMsg(e)); return null; }
  finally { saving = false; document.body.style.cursor = ''; }
}
function resetForm() {
  ['fBill', 'fProgram', 'fDeadline'].forEach(i => $(i).value = ''); $('fType').value = 'UMR'; $('fDate').value = todayISO(); $('fSubject').value = 'Invoice Pembayaran';
  $('itemsList').innerHTML = ''; $('paysList').innerHTML = ''; curId = null; curNo = null; curUpdated = null; $('pageTitle').textContent = 'Buat invoice baru';
  addItem(); addPay(); update();
}
function openInvoice(rec) {
  curId = rec.id; curNo = rec.number; curUpdated = rec.updatedAt; const d = rec.data;
  $('fType').value = d.type || 'UMR'; $('fDate').value = d.invoiceDate || todayISO(); $('fDeadline').value = d.deadline || ''; $('fBill').value = d.billTo || ''; $('fSubject').value = d.subject || ''; $('fProgram').value = d.program || '';
  $('itemsList').innerHTML = ''; $('paysList').innerHTML = '';
  (d.items.length ? d.items : [{}]).forEach(addItem); (d.payments.length ? d.payments : [{}]).forEach(addPay);
  $('pageTitle').textContent = 'Edit ' + rec.number; update(); setView('create'); toast('Dimuat' + (rec.updatedBy ? ' · terakhir diubah oleh ' + uid(rec.updatedBy) : '') + '.');
}

/* ---------- PDF ---------- */
async function renderPdf(d, st, number) {
  const stage = $('pdfStage'); stage.innerHTML = invoiceHTML(d, st, number);
  try { await Promise.all(['400 12px KDejavu', '700 12px KDejavu', 'italic 400 12px KDejavu', '400 12px KArial', '700 12px KArial'].map(f => document.fonts.load(f))); await document.fonts.ready; } catch (e) { }
  await Promise.all([...stage.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  const el = stage.firstElementChild; const w = el.offsetWidth, h = el.offsetHeight;
  const scale = Math.min(3, Math.max(2, 7000 / w));
  const canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 1000 });
  stage.innerHTML = '';
  const { jsPDF } = window.jspdf, M = 5, pw = 210, iw = pw - 2 * M, ih = iw * h / w;
  const pdf = new jsPDF({ unit: 'mm', format: [pw, ih + 2 * M], orientation: (ih + 2 * M) > pw ? 'p' : 'l', compress: true });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', M, M, iw, ih, undefined, 'FAST');
  pdf.setProperties({ title: number, author: st.company, creator: 'Khidma Invoice' });
  return pdf.output('blob');
}
const fname = (no, d) => `${no.replace(/\//g, '-')}_${(d.billTo || 'invoice').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
let lastPdf = null;
function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function makePdf(d, st, no, quiet) {
  toast('Membuat PDF…'); lastPdf = null;
  try {
    const blob = await renderPdf(d, st, no); lastPdf = { blob, name: fname(no, d) };
    dlBlob(blob, lastPdf.name); showPdfModal(); toast('PDF dibuat.');
  } catch (e) { console.error(e); toast('Gagal membuat PDF: ' + (e.message || e)); }
}
function canShare() { try { if (!lastPdf || !navigator.canShare) return false; return navigator.canShare({ files: [new File([lastPdf.blob], lastPdf.name, { type: 'application/pdf' })] }); } catch (e) { return false; } }
async function sharePdf() {
  if (!lastPdf) return; try { await navigator.share({ files: [new File([lastPdf.blob], lastPdf.name, { type: 'application/pdf' })], title: lastPdf.name }); } catch (e) { }
}
function showPdfModal() { $('pdfName').textContent = lastPdf.name; $('pdfShare').classList.toggle('hidden', !canShare()); $('pdfModal').classList.add('open'); }
async function saveAndPdf() { const rec = await saveInvoice(); if (rec) await makePdf(rec.data, settings, rec.number); }

/* ---------- history (database bersama) ---------- */
let cache = [], histLoading = false;
async function fetchInvoices() {
  histLoading = true;
  try { const { data, error } = await sb.from('invoices').select('*').order('updated_at', { ascending: false }).limit(1000); if (error) throw error; cache = (data || []).map(mapRow); }
  finally { histLoading = false; }
}
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return dShort(String(iso).slice(0, 10)); }
function renderHist() {
  const q = ($('hSearch').value || '').toLowerCase().trim(), all = cache;
  const f = all.filter(i => `${i.number} ${i.data?.billTo || ''} ${i.data?.program || ''} ${i.createdBy || ''}`.toLowerCase().includes(q));
  $('hCount').textContent = `${all.length} dokumen · dibagikan ke seluruh tim`;
  if (!f.length) { $('hList').innerHTML = `<div class="empty"><div class="ic">▤</div><b>${all.length ? 'Invoice tidak ditemukan' : (histLoading ? 'Memuat…' : 'Belum ada invoice')}</b><div style="font-size:12px;margin-top:6px">${all.length ? 'Coba kata kunci lain.' : 'Invoice yang disimpan akan muncul di sini untuk seluruh tim.'}</div></div>`; return; }
  $('hList').innerHTML = f.map(i => {
    const c = i.calc, s = c.status === 'paid' ? ['LUNAS', 'paid'] : c.status === 'over' ? ['LEBIH BAYAR', 'over'] : ['BELUM LUNAS', 'unpaid'];
    const who = i.updatedBy && i.updatedBy !== i.createdBy ? `dibuat ${esc(uid(i.createdBy) || '—')} · diubah ${esc(uid(i.updatedBy))} ${esc(ago(i.updatedAt))}` : `oleh ${esc(uid(i.createdBy) || '—')} · ${esc(ago(i.updatedAt))}`;
    return `<div class="hcard"><div><div class="hno">${esc(i.number)}</div><div class="hname">${esc(i.data?.billTo || 'Tanpa nama')}</div><div class="hmeta">${esc(i.data?.program || '—')} · ${esc(dShort(i.data?.invoiceDate))}</div><div class="hmeta">${who}</div></div>
<div class="hright"><div><div class="hamt">${idr(c.total)}</div><span class="st ${s[1]}">${s[0]}</span></div><div class="hact"><button class="sb" data-a="open" data-id="${esc(i.id)}">Buka</button><button class="sb" data-a="pdf" data-id="${esc(i.id)}">PDF</button>${can('delete') ? `<button class="sb del" data-a="del" data-id="${esc(i.id)}" aria-label="Hapus">✕</button>` : ''}</div></div></div>`;
  }).join('');
}
async function refreshHist(quiet) {
  renderHist();
  try { await fetchInvoices(); renderHist(); if (!quiet) toast('Riwayat diperbarui.'); } catch (e) { toast('Gagal memuat: ' + errMsg(e)); }
}
$('hList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return; const rec = cache.find(x => x.id === b.dataset.id); if (!rec) return;
  if (b.dataset.a === 'open') {
    const { data, error } = await sb.from('invoices').select('*').eq('id', rec.id).maybeSingle();
    if (error) return toast('Gagal membuka: ' + errMsg(error)); if (!data) { toast('Invoice sudah dihapus.'); return refreshHist(true); }
    openInvoice(mapRow(data));
  }
  if (b.dataset.a === 'pdf') makePdf(rec.data, { ...settings, ...rec.settings, logoData: settings.logoData, signatureData: settings.signatureData }, rec.number);
  if (b.dataset.a === 'del' && confirm(`Hapus ${rec.number} untuk SELURUH tim? Tindakan ini tidak bisa dibatalkan.`)) {
    const { data, error } = await sb.from('invoices').delete().eq('id', rec.id).select();
    if (error) return toast('Gagal menghapus: ' + errMsg(error)); if (!data.length) return toast('Anda tidak punya izin menghapus invoice.');
    if (curId === rec.id) { curId = null; curNo = null; curUpdated = null; }
    await refreshHist(true); toast('Invoice dihapus.');
  }
});
$('exportBtn').addEventListener('click', () => { dlBlob(new Blob([JSON.stringify({ invoices: cache.map(i => ({ number: i.number, createdBy: i.createdBy, updatedAt: i.updatedAt, data: i.data })) }, null, 1)], { type: 'application/json' }), `cadangan-invoice-${todayISO()}.json`); });
$('refreshBtn').addEventListener('click', () => refreshHist(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden && me && $('historyView').classList.contains('active')) refreshHist(true); });

/* ---------- settings modal ---------- */
let pAccs = [], pLogo = '', pSig = '';
function readAccs() { return [...$('sAccs').children].map(r => ({ bank: r.querySelector('.ab').value.trim(), name: r.querySelector('.an').value.trim(), number: r.querySelector('.ac').value.trim() })); }
function drawAccs() {
  $('sAccs').innerHTML = pAccs.map((a, i) => `<div class="acc"><div class="field bk"><label>Nama bank</label><input class="ab" list="bankList" placeholder="Contoh: Bank BCA" value="${esc(a.bank || '')}"></div><div class="field"><label>Atas nama</label><input class="an" value="${esc(a.name)}"></div><div class="field"><label>No. rekening</label><input class="ac" inputmode="numeric" value="${esc(a.number)}"></div><button class="x" type="button" data-i="${i}">Hapus</button></div>`).join('');
}
function prevImg(k, url) { const im = $(k === 'l' ? 'sLogoPrev' : 'sSigPrev'), em = $(k === 'l' ? 'sLogoEmpty' : 'sSigEmpty'); if (url) { im.src = url; im.style.display = 'block'; em.style.display = 'none'; } else { im.removeAttribute('src'); im.style.display = 'none'; em.style.display = 'inline'; } }
function openSet() {
  $('sCompany').value = settings.company; $('sAddress').value = settings.address; $('sPhone').value = settings.phone; $('sEmail').value = settings.email;
  pAccs = clone(settings.accounts); drawAccs(); $('sSigner').value = settings.signer; $('sPlace').value = settings.place; $('sNote').value = settings.note; $('sSigAlign').value = settings.signatureAlign || 'start';
  pLogo = settings.logoData || ''; pSig = settings.signatureData || ''; prevImg('l', pLogo); prevImg('s', pSig); $('sLogoFile').value = ''; $('sSigFile').value = '';
  $('pwNew').value = ''; showAlert('pwAlert', ''); $('sWho').textContent = `${profile && profile.user_id ? profile.user_id : uid(me && me.email)}${profile && profile.full_name ? ' (' + profile.full_name + ')' : ''} · ${isAdmin() ? 'Admin' : 'Staf'}`;
  document.querySelectorAll('#setModal [data-admin]').forEach(g => g.querySelectorAll('input,textarea,select,button').forEach(x => { x.disabled = !can('settings'); }));
  $('adminNote').classList.toggle('hidden', can('settings')); $('setSave').classList.toggle('hidden', !can('settings'));
  $('importBox').classList.toggle('hidden', !(isAdmin() && legacyInvoices().length)); $('setModal').classList.add('open');
}
const closeSet = () => $('setModal').classList.remove('open');
function compress(file, mw, mh) {
  return new Promise((res, rej) => {
    if (!file || !file.type.startsWith('image/')) return rej(new Error('Pilih file gambar.')); if (file.size > 10 * 1048576) return rej(new Error('Maksimal 10 MB.'));
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const r = Math.min(1, mw / im.naturalWidth, mh / im.naturalHeight), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/png')); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Gambar tidak terbaca.')); }; im.src = u;
  });
}
async function upload(k, f) { if (!f) return; try { const d = await compress(f, k === 'l' ? 800 : 900, k === 'l' ? 800 : 400); if (k === 'l') pLogo = d; else pSig = d; prevImg(k, d); toast('Gambar dimuat. Klik Simpan.'); } catch (e) { toast(e.message); } }
$('sLogoFile').addEventListener('change', e => upload('l', e.target.files[0])); $('sSigFile').addEventListener('change', e => upload('s', e.target.files[0]));
$('sLogoClr').addEventListener('click', () => { pLogo = ''; prevImg('l', ''); $('sLogoFile').value = ''; }); $('sSigClr').addEventListener('click', () => { pSig = ''; prevImg('s', ''); $('sSigFile').value = ''; });
$('sAddAcc').addEventListener('click', () => { pAccs = readAccs(); pAccs.push({ bank: (pAccs[pAccs.length - 1] || {}).bank || '', name: '', number: '' }); drawAccs(); });
$('sAccs').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; pAccs = readAccs(); pAccs.splice(+b.dataset.i, 1); drawAccs(); });
$('setSave').addEventListener('click', async () => {
  if (!can('settings')) return toast('Anda tidak punya izin mengubah pengaturan.');
  const next = { company: $('sCompany').value.trim() || DEF.company, address: $('sAddress').value.trim(), phone: $('sPhone').value.trim(), email: $('sEmail').value.trim(), bankName: settings.bankName || DEF.bankName, accounts: readAccs().filter(a => a.name || a.number), signer: $('sSigner').value.trim(), place: $('sPlace').value.trim(), note: $('sNote').value.trim(), logoData: pLogo, signatureData: pSig, signatureAlign: $('sSigAlign').value };
  const { error } = await sb.from('app_settings').upsert({ id: 1, data: next });
  if (error) return toast('Gagal menyimpan: ' + errMsg(error));
  settings = next; update(); closeSet(); toast('Pengaturan disimpan untuk seluruh tim.');
});
$('pwSave').addEventListener('click', async () => {
  const n = $('pwNew').value; if (n.length < 8) return showAlert('pwAlert', 'Password baru minimal 8 karakter.');
  const { error } = await sb.auth.updateUser({ password: n });
  if (error) return showAlert('pwAlert', errMsg(error)); $('pwNew').value = ''; showAlert('pwAlert', 'Password berhasil diganti.', 'ok');
});
/* ----- impor data lama (dari versi tanpa database) ----- */
const legacyInvoices = () => { const l = L(K.inv, []); return Array.isArray(l) ? l.filter(r => r && r.data && r.number) : []; };
$('importBtn').addEventListener('click', async () => {
  const list = legacyInvoices(); if (!list.length) return;
  if (!confirm(`Impor ${list.length} invoice dari perangkat ini ke database tim?`)) return;
  let ok = 0, dup = 0, fail = 0; const max = {};
  $('importBtn').disabled = true;
  for (const r of list.slice().reverse()) {
    const d = r.data, c = calc(d);
    const { error } = await sb.from('invoices').insert({ number: r.number, type: d.type || 'UMR', invoice_date: d.invoiceDate || null, bill_to: d.billTo || '', program: d.program || '', total: c.total, paid: c.paid, status: c.status, data: d, settings: r.settings || null });
    if (!error) ok++; else if (error.code === '23505') dup++; else fail++;
    const m = /^INV\/(UMR|HJI|INV)\/(\d{4})\/(\d+)$/.exec(r.number); if (m && !error) { const k = m[1] + '-' + m[2]; max[k] = Math.max(max[k] || 0, +m[3]); }
  }
  for (const k in max) await sb.rpc('bump_counter', { p_key: k, p_last: max[k] });
  const old = L(K.set, null); if (old && old.company && confirm('Pakai juga pengaturan perusahaan (rekening, logo, dll.) dari perangkat ini sebagai pengaturan tim?')) {
    const next = normSettings({ ...clone(DEF), ...old }); const { error } = await sb.from('app_settings').upsert({ id: 1, data: next }); if (!error) { settings = next; update(); }
  }
  $('importBtn').disabled = false; await refreshHist(true);
  toast(`Impor selesai: ${ok} berhasil, ${dup} dilewati (nomor sudah ada)${fail ? ', ' + fail + ' gagal' : ''}.`);
});
['setClose', 'setCancel'].forEach(i => $(i).addEventListener('click', closeSet)); $('setModal').addEventListener('click', e => { if (e.target === $('setModal')) closeSet(); });
$('openSettings').addEventListener('click', openSet); $('bnSettings').addEventListener('click', openSet);
$('setLogout').addEventListener('click', logout); $('logoutBtn').addEventListener('click', () => { if (confirm('Keluar dari aplikasi?')) logout(); });


/* ---------- pengguna (khusus admin) ---------- */
async function callAdmin(body, retry = true) {
  const { data, error } = await sb.functions.invoke('admin-users', { body });
  if (error && retry && error.context && error.context.status === 401) {     // sesi kedaluwarsa? perbarui sesi lalu coba sekali lagi
    const r = await sb.auth.refreshSession(); if (!r.error) return callAdmin(body, false);
  }
  if (error) { let msg = error.message; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { } throw new Error(msg); }
  if (data && data.error) throw new Error(data.error); return data;
}
let usersCache = [];
const PERM_LBL = { create: 'Buat invoice', edit: 'Koreksi invoice', delete: 'Hapus invoice', settings: 'Ubah pengaturan' };
async function loadUsers() {
  $('uList').innerHTML = '<div class="empty"><b>Memuat…</b></div>';
  try { usersCache = (await callAdmin({ action: 'list' })).users || []; renderUsers(); }
  catch (e) { $('uList').innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
}
function renderUsers() {
  $('uCount').textContent = `${usersCache.length} pengguna`;
  $('uList').innerHTML = usersCache.map(u => {
    const chips = u.role === 'admin' ? '<span class="chip on">Semua hak akses</span>' : Object.keys(PERM_LBL).map(k => `<span class="chip ${u.perms && u.perms[k] ? 'on' : ''}">${u.perms && u.perms[k] ? '✓' : '✕'} ${PERM_LBL[k]}</span>`).join('');
    return `<div class="hcard ${u.active ? '' : 'off'}"><div class="hmain"><div class="hno">${esc(u.user_id)} ${u.id === me.id ? '<span class="st paid">Anda</span>' : ''}${u.active ? '' : ' <span class="st over">NONAKTIF</span>'}</div><div class="hname">${esc(u.full_name || '—')}</div><div class="hmeta"><span class="st ${u.role === 'admin' ? 'paid' : 'unpaid'}" style="margin:0">${u.role === 'admin' ? 'ADMIN' : 'STAF'}</span></div><div class="chips">${chips}</div></div><div class="hright"><div class="hact"><button class="sb" data-u="${esc(u.id)}">Atur</button></div></div></div>`;
  }).join('') || '<div class="empty"><b>Belum ada pengguna</b></div>';
}
const genPw = () => { const al = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = new Uint8Array(10); crypto.getRandomValues(r); return [...r].map(x => al[x % al.length]).join(''); };
let editingUser = null;
function permBoxes(on) { ['Create', 'Edit', 'Delete', 'Settings'].forEach(k => { $('up' + k).disabled = on; if (on) $('up' + k).checked = true; }); }
function openUser(u) {
  editingUser = u || null; const isNew = !u, self = u && u.id === me.id;
  $('uTitle').textContent = isNew ? 'Tambah pengguna' : 'Atur pengguna: ' + u.user_id; showAlert('uAlert', '');
  $('uId').value = isNew ? '' : u.user_id; $('uId').disabled = !isNew; $('uName').value = isNew ? '' : (u.full_name || '');
  $('uPass').value = isNew ? genPw() : ''; $('uPassLbl').textContent = isNew ? 'Password awal (catat & berikan ke pengguna)' : 'Reset password (kosongkan jika tidak diubah)';
  $('uRole').value = isNew ? 'staff' : u.role; $('uRole').disabled = !!self;
  const pr = isNew ? { create: true, edit: true, delete: false, settings: false } : (u.perms || {});
  $('upCreate').checked = !!pr.create; $('upEdit').checked = !!pr.edit; $('upDelete').checked = !!pr.delete; $('upSettings').checked = !!pr.settings;
  permBoxes($('uRole').value === 'admin');
  $('uActive').checked = isNew ? true : u.active; $('uActiveBox').classList.toggle('hidden', isNew || !!self);
  $('uDelete').classList.toggle('hidden', isNew || !!self); $('uModal').classList.add('open');
}
$('uRole').addEventListener('change', () => permBoxes($('uRole').value === 'admin'));
$('uGen').addEventListener('click', () => { $('uPass').value = genPw(); });
$('uAdd').addEventListener('click', () => openUser(null));
$('uList').addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) openUser(usersCache.find(x => x.id === b.dataset.u)); });
$('uClose').addEventListener('click', () => $('uModal').classList.remove('open')); $('uCancel').addEventListener('click', () => $('uModal').classList.remove('open'));
$('uSave').addEventListener('click', async () => {
  const permObj = { create: $('upCreate').checked, edit: $('upEdit').checked, delete: $('upDelete').checked, settings: $('upSettings').checked };
  const btn = $('uSave'); btn.disabled = true; showAlert('uAlert', '');
  try {
    if (!editingUser) {
      const idv = $('uId').value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(idv)) throw new Error('User ID 3–30 karakter: huruf kecil, angka, titik, strip, atau garis bawah (tanpa spasi).');
      if ($('uPass').value.length < 8) throw new Error('Password minimal 8 karakter.');
      await callAdmin({ action: 'create', user_id: $('uId').value.trim().toLowerCase(), full_name: $('uName').value.trim(), password: $('uPass').value, role: $('uRole').value, perms: permObj });
      toast('Pengguna dibuat. Berikan User ID & password ke yang bersangkutan.');
    } else {
      const self = editingUser.id === me.id;
      await callAdmin({ action: 'update', id: editingUser.id, full_name: $('uName').value.trim(), ...(self ? {} : { role: $('uRole').value, active: $('uActive').checked }), perms: permObj });
      if ($('uPass').value) await callAdmin({ action: 'reset_password', id: editingUser.id, password: $('uPass').value });
      toast('Perubahan disimpan.');
    }
    $('uModal').classList.remove('open'); await loadUsers();
  } catch (e) { showAlert('uAlert', errMsg(e)); }
  btn.disabled = false;
});
$('uDelete').addEventListener('click', async () => {
  if (!editingUser || !confirm(`Hapus pengguna ${editingUser.user_id}? Invoice buatannya tetap ada.`)) return;
  try { await callAdmin({ action: 'delete', id: editingUser.id }); $('uModal').classList.remove('open'); toast('Pengguna dihapus.'); await loadUsers(); } catch (e) { showAlert('uAlert', errMsg(e)); }
});

/* ---------- navigasi ---------- */
function setView(v) {
  if (v === 'users' && !isAdmin()) v = 'create';
  $('createView').classList.toggle('active', v === 'create'); $('historyView').classList.toggle('active', v === 'history'); $('usersView').classList.toggle('active', v === 'users');
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === v));
  if (v === 'history') refreshHist(true); if (v === 'users') loadUsers(); window.scrollTo({ top: 0 }); if (v === 'create') requestAnimationFrame(fit);
}
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => setView(b.dataset.nav)));
function setTab(t) { $('workspace').dataset.tab = t; document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); window.scrollTo({ top: 0 }); requestAnimationFrame(fit); }
document.querySelectorAll('#seg button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

$('addItem').addEventListener('click', () => { addItem(); update(); }); $('addPay').addEventListener('click', () => { addPay({ date: todayISO() }); update(); });
$('resetBtn').addEventListener('click', () => { if (confirm('Bersihkan formulir dan mulai invoice baru?')) resetForm(); });
$('newInvoice').addEventListener('click', () => { resetForm(); setView('create'); }); $('newFromHist').addEventListener('click', () => { resetForm(); setView('create'); });
$('saveBtn').addEventListener('click', async () => { if (await saveInvoice()) toast('Invoice tersimpan & dibagikan ke tim.'); });
$('savePdfBtn').addEventListener('click', saveAndPdf); $('pdfBtn2').addEventListener('click', saveAndPdf);
$('shareBtn').addEventListener('click', sharePdf); $('pdfShare').addEventListener('click', sharePdf);
$('pdfClose').addEventListener('click', () => $('pdfModal').classList.remove('open'));
$('pdfDl').addEventListener('click', () => lastPdf && dlBlob(lastPdf.blob, lastPdf.name));
$('pdfOpen').addEventListener('click', () => { if (lastPdf) { const u = URL.createObjectURL(lastPdf.blob); window.open(u, '_blank') || (location.href = u); } });
$('hSearch').addEventListener('input', renderHist);
['fType', 'fDate'].forEach(i => $(i).addEventListener('change', () => { if (!curId) curNo = null; update(); }));
$('invForm').addEventListener('input', update);
window.addEventListener('resize', fit);

function normSettings(st) {
  if (!Array.isArray(st.accounts)) st.accounts = clone(DEF.accounts);
  const fb = st.bankName || 'Bank Mandiri'; st.accounts = st.accounts.map(a => ({ ...a, bank: a.bank || fb })); return st;
}
let appStarted = false;
async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('role,perms,active,full_name,user_id').eq('id', me.id).maybeSingle(); if (error) throw error;
  profile = data; role = data && data.role === 'admin' ? 'admin' : 'staff'; perms = (data && data.perms) || {};
}
async function loadSettings() {
  const { data, error } = await sb.from('app_settings').select('data').eq('id', 1).maybeSingle(); if (error) throw error;
  if (!data && isAdmin()) await sb.from('app_settings').upsert({ id: 1, data: clone(DEF) });   // admin pertama: isi default
  settings = normSettings({ ...clone(DEF), ...((data && data.data) || {}) });
}
function applyPerms() {
  const w = can('create') || can('edit');
  ['saveBtn', 'savePdfBtn', 'pdfBtn2'].forEach(i => $(i).classList.toggle('hidden', !w));
  $('newInvoice').classList.toggle('hidden', !can('create')); $('newFromHist').classList.toggle('hidden', !can('create'));
  document.querySelectorAll('[data-nav=users]').forEach(b => b.classList.toggle('hidden', !isAdmin()));
  $('bnav').style.gridTemplateColumns = `repeat(${isAdmin() ? 4 : 3},1fr)`;
}
async function enterApp(user) {
  me = user;
  try { await loadProfile(); } catch (e) { console.error(e); toast(errMsg(e)); }
  if (profile && profile.active === false) { try { await sb.auth.signOut(); } catch (e) { } me = null; showAuth('loginForm'); return showAlert('loginAlert', 'Akun Anda dinonaktifkan. Hubungi admin.'); }
  try { await loadSettings(); } catch (e) { console.error(e); toast(errMsg(e)); }
  applyPerms();
  $('authScreen').classList.add('hidden'); $('appShell').classList.remove('hidden');
  if (!appStarted) { appStarted = true; resetForm(); }
  requestAnimationFrame(() => { update(); fit(); });
}

bootAuth();
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
window.__khidma = { renderPdf, invoiceHTML, DEF };
})();
