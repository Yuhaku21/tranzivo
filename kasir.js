(function(){
  const $ = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));

  const fmt = n => 'Rp ' + Math.round(n||0).toLocaleString('id-ID');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

  // Storage helpers: save and load data using browser localStorage only
  async function storageGet(key){
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      console.error('storageGet failed', e);
      return null;
    }
  }
  async function storageSet(key, value){
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('storageSet failed', e);
      if (typeof toast === 'function') toast('Gagal menyimpan data');
    }
  }

  let products = [];
  let transactions = [];
  let settings = { shopName: 'Kasir Toko', note: 'Terima kasih telah berbelanja', qris: '', bank: '', wa: '' };
  let cart = [];
  let currentCategory = 'Semua';
  let searchTerm = '';
  let discounts = [];
  let members = [];
  let activeDiscount = null;
  let activeMember = null;

  const seedProducts = () => ([
    { id: uid(), name: 'Indomie Goreng', category: 'Makanan', price: 3500, stock: 48 },
    { id: uid(), name: 'Es Teh Manis', category: 'Minuman', price: 5000, stock: 30 },
    { id: uid(), name: 'Kopi Sachet', category: 'Minuman', price: 2500, stock: 60 },
    { id: uid(), name: 'Air Mineral 600ml', category: 'Minuman', price: 4000, stock: 40 },
    { id: uid(), name: 'Roti Tawar', category: 'Makanan', price: 15000, stock: 12 },
    { id: uid(), name: 'Telur Ayam (kg)', category: 'Sembako', price: 28000, stock: 20 },
    { id: uid(), name: 'Minyak Goreng 1L', category: 'Sembako', price: 18000, stock: 15 },
    { id: uid(), name: 'Gula Pasir 1kg', category: 'Sembako', price: 15000, stock: 22 },
    { id: uid(), name: 'Sabun Mandi', category: 'Kebutuhan', price: 6000, stock: 25 },
    { id: uid(), name: 'Tisu Gulung', category: 'Kebutuhan', price: 7500, stock: 18 },
  ]);

  function toast(msg){
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
  }

  // ---------- Storage ----------
  async function loadAll(){
    try { const p = await storageGet('products'); products = p ? p : seedProducts(); }
    catch(e){ products = seedProducts(); }
    try { const t = await storageGet('transactions'); transactions = t ? t : []; }
    catch(e){ transactions = []; }
    try { const s = await storageGet('settings'); if (s) settings = Object.assign(settings, s); }
    catch(e){ /* defaults */ }
    try { const d = await storageGet('discounts'); discounts = d ? d : []; }
    catch(e){ discounts = []; }
    try { const m = await storageGet('members'); members = m ? m : []; }
    catch(e){ members = []; }
    let exists = false;
    try { exists = !!(await storageGet('products')); } catch(e){ exists = false; }
    if (!exists) await saveProducts();
  }
  async function saveProducts(){ try { await storageSet('products', products); } catch(e){ toast('Gagal menyimpan produk'); } }
  async function saveTransactions(){ try { await storageSet('transactions', transactions); } catch(e){ toast('Gagal menyimpan transaksi'); } }
  async function saveSettings(){ try { await storageSet('settings', settings); } catch(e){ toast('Gagal menyimpan pengaturan'); } }
  async function saveDiscounts(){ try { await storageSet('discounts', discounts); } catch(e){ toast('Gagal menyimpan diskon'); } }
  async function saveMembers(){ try { await storageSet('members', members); } catch(e){ toast('Gagal menyimpan member'); } }

  // ---------- Nav ----------
  $$('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const page = btn.dataset.page;
      $$('.page').forEach(p=>p.classList.remove('active'));
      $('#page-' + page).classList.add('active');
      const titles = { kasir: ['Kasir','Pilih produk untuk mulai transaksi'], produk: ['Produk','Kelola daftar produk dan stok'], riwayat: ['Rekap Penjualan','Riwayat transaksi dan ringkasan omzet'], pengaturan: ['Pengaturan','Info toko, QRIS, dan rekening transfer'] };
      $('#page-title').textContent = titles[page][0];
      $('#page-sub').textContent = titles[page][1];
      closeSheet();
      if (page === 'produk') renderProdukTable();
      if (page === 'riwayat') renderRiwayat();
      if (page === 'pengaturan') renderPengaturan();
    });
  });

  function updateClock(){
    const d = new Date();
    $('#clock').innerHTML = d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'}) + ' · ' + d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  }
  setInterval(updateClock, 30000);

  // ---------- Kasir: product grid ----------
  function renderCatChips(){
    const cats = ['Semua', ...new Set(products.map(p=>p.category))];
    $('#catChips').innerHTML = cats.map(c=>`<button class="chip${c===currentCategory?' active':''}" data-cat="${c}">${c}</button>`).join('');
    $$('.chip', $('#catChips')).forEach(chip=>{
      chip.addEventListener('click', ()=>{ currentCategory = chip.dataset.cat; renderCatChips(); renderProdGrid(); });
    });
  }

  function renderProdGrid(){
    const term = searchTerm.trim().toLowerCase();
    const list = products.filter(p=>{
      const matchCat = currentCategory==='Semua' || p.category===currentCategory;
      const matchTerm = !term || p.name.toLowerCase().includes(term);
      return matchCat && matchTerm;
    });
    if (!list.length){
      $('#prodGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Produk tidak ditemukan</div>`;
      return;
    }
    $('#prodGrid').innerHTML = list.map(p=>{
      const low = p.stock <= 5;
      const out = p.stock <= 0;
      return `<button class="prod-card" data-id="${p.id}" ${out?'disabled':''}>
        <div class="prod-name">${p.name}</div>
        <div class="prod-price num">${fmt(p.price)}</div>
        <div class="prod-stock ${low?'low':''}">${out?'Stok habis':'Stok: '+p.stock}</div>
      </button>`;
    }).join('');
    $$('.prod-card', $('#prodGrid')).forEach(card=>{
      card.addEventListener('click', ()=> addToCart(card.dataset.id));
    });
  }

  function addToCart(id){
    const p = products.find(x=>x.id===id);
    if (!p || p.stock <= 0) return;
    const item = cart.find(c=>c.id===id);
    const inCartQty = item ? item.qty : 0;
    if (inCartQty + 1 > p.stock) { toast('Stok tidak cukup'); return; }
    if (item) item.qty += 1;
    else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, stock: p.stock });
    renderCart();
    if (window.innerWidth <= 860 && cart.length === 1) toast('Ditambahkan ke keranjang');
  }

  function changeQty(id, delta){
    const item = cart.find(c=>c.id===id);
    if (!item) return;
    const p = products.find(x=>x.id===id);
    const next = item.qty + delta;
    if (next <= 0){ cart = cart.filter(c=>c.id!==id); }
    else if (p && next > p.stock){ toast('Stok tidak cukup'); return; }
    else item.qty = next;
    renderCart();
  }

  function renderCart(){
    const wrap = $('#cartList');
    if (!cart.length){
      wrap.innerHTML = `<div class="cart-empty">Keranjang masih kosong.<br>Klik produk di sebelah kiri.</div>`;
    } else {
      wrap.innerHTML = cart.map(c=>`
        <div class="cart-item" data-id="${c.id}">
          <div class="ci-name"><div class="n">${c.name}</div><div class="p num">${fmt(c.price)}</div></div>
          <div class="qty-ctl">
            <button data-act="dec">–</button><span class="q">${c.qty}</span><button data-act="inc">+</button>
          </div>
          <div class="ci-sub num">${fmt(c.price*c.qty)}</div>
          <button class="ci-del" data-act="del" title="Hapus">✕</button>
        </div>`).join('');
      $$('.cart-item', wrap).forEach(row=>{
        const id = row.dataset.id;
        row.querySelector('[data-act="inc"]').addEventListener('click', ()=>changeQty(id, 1));
        row.querySelector('[data-act="dec"]').addEventListener('click', ()=>changeQty(id, -1));
        row.querySelector('[data-act="del"]').addEventListener('click', ()=>{ cart = cart.filter(c=>c.id!==id); renderCart(); });
      });
    }
    const total = cart.reduce((s,c)=>s+c.price*c.qty,0);
    const count = cart.reduce((s,c)=>s+c.qty,0);
    $('#cartCountLbl').textContent = count + ' item di keranjang';
    $('#sumSubtotal').textContent = fmt(total);
    $('#sumTotal').textContent = fmt(cartTotal());
    $('#btnBayar').disabled = cart.length === 0;
    $('#mcCount').textContent = count;
    $('#mcTotal').textContent = fmt(total);
    $('#miniCartBar').classList.toggle('show', cart.length > 0);
    if (cart.length === 0) closeSheet();
  }

  $('#searchInput').addEventListener('input', e=>{ searchTerm = e.target.value; renderProdGrid(); });
  $('#btnClearCart').addEventListener('click', ()=>{ cart = []; renderCart(); });

  // ---------- Mobile cart sheet ----------
  function openSheet(){
    $('#cartCol').classList.add('sheet-open');
    $('#cartBackdrop').classList.add('show');
  }
  function closeSheet(){
    $('#cartCol').classList.remove('sheet-open');
    $('#cartBackdrop').classList.remove('show');
  }
  $('#miniCartBar').addEventListener('click', openSheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#cartBackdrop').addEventListener('click', closeSheet);

  // ---------- Payment modal ----------
  let payMethod = 'tunai';
  let cashGiven = 0;

  function openModal(html, opts){
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal ${opts&&opts.wide?'wide':''}">${html}</div>`;
    $('#modalRoot').innerHTML = '';
    $('#modalRoot').appendChild(overlay);
    overlay.addEventListener('mousedown', e=>{ if(e.target===overlay) closeModal(); });
    return overlay;
  }
  function closeModal(){ $('#modalRoot').innerHTML = ''; }

  $('#btnBayar').addEventListener('click', ()=>{
    if (!cart.length) return;
    payMethod = 'tunai'; cashGiven = 0;
    closeSheet();
    renderPayModal();
  });

  function cartSubtotal(){ return cart.reduce((s,c)=>s+c.price*c.qty,0); }
  function cartTotal(){
    let total = cartSubtotal();
    if (activeDiscount){
      if (activeDiscount.type === 'percent') total = total * (1 - activeDiscount.value/100);
      else total = Math.max(0, total - activeDiscount.value);
    }
    if (activeMember && activeMember.discount > 0){ total = total * (1 - activeMember.discount/100); }
    return Math.round(total);
  }

  function formatDiscountBadge(){
    const pieces = [];
    if (activeDiscount) pieces.push(activeDiscount.name);
    if (activeMember) pieces.push(activeMember.name + ' (' + activeMember.discount + '%)');
    return pieces.length ? pieces.join(' · ') : '';
  }

  function filterMemberOptions(overlay, query){
    const term = query.trim().toLowerCase();
    const select = $('#memberSelect', overlay);
    select.innerHTML = '<option value="">Bukan member</option>' + members.filter(m=>{
      if (!term) return true;
      return m.phone.toLowerCase().includes(term) || m.name.toLowerCase().includes(term);
    }).map(m=>`<option value="${m.id}" ${activeMember&&activeMember.id===m.id?'selected':''}>${m.name} (${m.phone}) - ${m.discount}%</option>`).join('');
  }

  function renderPayModal(){
    const subtotal = cartSubtotal();
    const total = cartTotal();
    const overlay = openModal(`
      <div class="modal-head"><h3>Pembayaran</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body">
        <div class="big-total"><div class="lbl">Subtotal</div><div class="val num" style="font-size:24px;">${fmt(subtotal)}</div></div>
        <div style="margin:0 0 16px 0;padding:10px 12px;border:1px dashed var(--border-strong);border-radius:8px;background:var(--paper);font-size:12.5px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Diskon</span><span class="num">${activeDiscount ? (activeDiscount.type==='percent' ? activeDiscount.value+'%' : fmt(activeDiscount.value)) : 'Tidak ada'}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Member</span><span class="num">${activeMember ? activeMember.discount + '%' : 'Tidak ada'}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:6px;border-top:1px dashed var(--border-strong);"><span>Total akhir</span><span class="num">${fmt(total)}</span></div>
        </div>
        <div class="field"><label>Diskon</label><select id="discountSelect"><option value="">Tidak pakai diskon</option>${discounts.map(d=>`<option value="${d.id}" ${activeDiscount&&activeDiscount.id===d.id?'selected':''}>${d.name} (${d.type==='percent'?d.value+'%':fmt(d.value)})</option>`).join('')}</select></div>
        <div class="field"><label>Pencarian Member (Berdasarkan HP)</label><input type="text" id="memberSearch" placeholder="Cari nomor HP atau nama"></div>
        <div class="field"><label>Member</label><select id="memberSelect"><option value="">Bukan member</option>${members.map(m=>`<option value="${m.id}" ${activeMember&&activeMember.id===m.id?'selected':''}>${m.name} (${m.phone}) - ${m.discount}%</option>`).join('')}</select></div>
        <div class="pay-tabs">
          <button class="pay-tab" data-m="tunai">Tunai</button>
          <button class="pay-tab" data-m="qris">QRIS</button>
          <button class="pay-tab" data-m="transfer">Transfer</button>
        </div>
        <div id="payBody"></div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="mCancel" style="flex:1;">Batal</button>
        <button class="btn btn-primary" id="mConfirm" style="flex:2;">Konfirmasi Pembayaran</button>
      </div>
    `);
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mCancel', overlay).addEventListener('click', closeModal);
    $('#discountSelect', overlay).addEventListener('change', e=>{ activeDiscount = discounts.find(d=>d.id===e.target.value) || null; renderPayModal(); });
    $('#memberSelect', overlay).addEventListener('change', e=>{ activeMember = members.find(m=>m.id===e.target.value) || null; renderPayModal(); });
    $('#memberSearch', overlay).addEventListener('input', e=> filterMemberOptions(overlay, e.target.value));
    $$('.pay-tab', overlay).forEach(tab=>{
      tab.addEventListener('click', ()=>{ payMethod = tab.dataset.m; cashGiven = 0; renderPayBody(overlay, total); });
    });
    renderPayBody(overlay, total);
    $('#mConfirm', overlay).addEventListener('click', ()=> confirmPayment(overlay, total));
  }

  function renderPayBody(overlay, total){
    $$('.pay-tab', overlay).forEach(t=>t.classList.toggle('active', t.dataset.m===payMethod));
    const body = $('#payBody', overlay);
    const confirmBtn = $('#mConfirm', overlay);
    confirmBtn.disabled = false;

    if (payMethod === 'tunai'){
      body.innerHTML = `
        <div class="field"><label>Uang Diterima</label><input type="number" id="cashInput" min="0" placeholder="0" inputmode="numeric"></div>
        <div class="quick-cash">
          ${[total, Math.ceil(total/5000)*5000, Math.ceil(total/10000)*10000, Math.ceil(total/20000)*20000, Math.ceil(total/50000)*50000, Math.ceil(total/100000)*100000]
            .filter((v,i,a)=>a.indexOf(v)===i).slice(0,6).map(v=>`<button data-v="${v}">${fmt(v)}</button>`).join('')}
        </div>
        <div class="change-box" id="changeBox"><span class="lbl">Kembalian</span><span class="val num" id="changeVal">Rp 0</span></div>
      `;
      const input = $('#cashInput', body);
      const update = () => {
        cashGiven = Number(input.value) || 0;
        const change = cashGiven - total;
        $('#changeBox', body).classList.toggle('neg', change < 0);
        $('#changeVal', body).textContent = change < 0 ? '- ' + fmt(Math.abs(change)) : fmt(change);
        confirmBtn.disabled = cashGiven < total;
      };
      input.addEventListener('input', update);
      $$('[data-v]', body).forEach(b=> b.addEventListener('click', ()=>{ input.value = b.dataset.v; update(); }));
      confirmBtn.disabled = true;
    }

    if (payMethod === 'qris'){
      if (settings.qris){
        body.innerHTML = `<div class="qris-box"><img src="${settings.qris}"><div class="muted" style="font-size:12px;color:var(--ink-soft);margin-top:8px;">Minta pelanggan memindai kode QRIS ini, lalu konfirmasi setelah pembayaran diterima.</div></div>`;
      } else {
        body.innerHTML = `<div class="qris-empty">Belum ada gambar QRIS. Unggah dulu di menu <b>Pengaturan</b> agar bisa ditampilkan di sini.</div>`;
      }
    }

    if (payMethod === 'transfer'){
      body.innerHTML = `<div class="transfer-box">${settings.bank ? 'Transfer ke <b>'+settings.bank+'</b>' : 'Rekening transfer belum diatur. Atur di menu <b>Pengaturan</b>.'}<br><br>Konfirmasi setelah dana diterima.</div>`;
    }
  }

  async function confirmPayment(overlay, total){
    const trx = {
      id: uid(),
      date: new Date().toISOString(),
      items: cart.map(c=>({ id:c.id, name:c.name, price:c.price, qty:c.qty, subtotal:c.price*c.qty })),
      subtotal: cartSubtotal(),
      total,
      discount: activeDiscount ? { id: activeDiscount.id, name: activeDiscount.name, type: activeDiscount.type, value: activeDiscount.value } : null,
      member: activeMember ? { id: activeMember.id, name: activeMember.name, phone: activeMember.phone, discount: activeMember.discount } : null,
      method: payMethod,
      cashGiven: payMethod==='tunai' ? cashGiven : null,
      change: payMethod==='tunai' ? (cashGiven-total) : null,
    };
    transactions.unshift(trx);
    cart.forEach(c=>{
      const p = products.find(x=>x.id===c.id);
      if (p) p.stock = Math.max(0, p.stock - c.qty);
    });
    await saveTransactions();
    await saveProducts();
    cart = [];
    activeDiscount = null;
    activeMember = null;
    renderCart();
    renderProdGrid();
    showSuccessModal(trx);
  }

  function showSuccessModal(trx){
    const methodLabel = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer Bank' }[trx.method];
    const overlay = openModal(`
      <div class="modal-body" style="text-align:center;">
        <div class="success-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg></div>
        <h3 style="font-family:'Space Grotesk';font-size:17px;margin:0 0 4px 0;">Pembayaran Berhasil</h3>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:16px;">${methodLabel} · ${new Date(trx.date).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div>
        <div style="text-align:left;background:var(--paper);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
          ${trx.items.map(i=>`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;"><span>${i.qty}x ${i.name}</span><span class="num">${fmt(i.subtotal)}</span></div>`).join('')}
          ${trx.discount ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);padding-top:6px;"><span>Diskon</span><span class="num">${trx.discount.type==='percent' ? trx.discount.value+'%' : fmt(trx.discount.value)}</span></div>` : ''}
          ${trx.member ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);padding-top:4px;"><span>Member</span><span class="num">${trx.member.discount}%</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:8px;margin-top:6px;border-top:1px dashed var(--border-strong);"><span>Total</span><span class="num">${fmt(trx.total)}</span></div>
          ${trx.method==='tunai' ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);padding-top:4px;"><span>Kembalian</span><span class="num">${fmt(trx.change)}</span></div>` : ''}
        </div>
        <div class="post-actions">
          <button class="btn" id="mPrint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>Cetak</button>
          <button class="btn btn-outline-blue" id="mShare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zm12 6a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 3.9m0-11.8l-6.8 3.9"/></svg>WhatsApp</button>
        </div>
        <button class="btn btn-primary btn-block" id="mDone">Transaksi Baru</button>
      </div>
    `);
    $('#mDone', overlay).addEventListener('click', closeModal);
    $('#mPrint', overlay).addEventListener('click', ()=> printReceipt(trx));
    $('#mShare', overlay).addEventListener('click', ()=> shareWhatsApp(trx));
  }

  // ---------- Cetak & Bagikan ----------
  function buildReceiptText(trx){
    const dt = new Date(trx.date);
    const methodLabel = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer Bank' }[trx.method];
    let lines = [];
    lines.push(`*${settings.shopName || 'Kasir Toko'}*`);
    lines.push(dt.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) + ' ' + dt.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}));
    lines.push('—'.repeat(20));
    trx.items.forEach(i=> lines.push(`${i.qty}x ${i.name} — ${fmt(i.subtotal)}`));
    lines.push('—'.repeat(20));
    lines.push(`Subtotal: ${fmt(trx.subtotal || trx.total)}`);
    if (trx.discount) lines.push(`Diskon: ${trx.discount.type==='percent' ? trx.discount.value+'%' : fmt(trx.discount.value)}`);
    if (trx.member) lines.push(`Member: ${trx.member.name} (${trx.member.discount}%)`);
    lines.push(`Total: ${fmt(trx.total)}`);
    if (trx.method === 'tunai'){
      lines.push(`Bayar: ${fmt(trx.cashGiven)}`);
      lines.push(`Kembali: ${fmt(trx.change)}`);
    }
    lines.push(`Metode: ${methodLabel}`);
    if (settings.note) lines.push('');
    if (settings.note) lines.push(settings.note);
    lines.push('');
    lines.push(`No. Struk: ${trx.id.slice(-6).toUpperCase()}`);
    return lines.join('\n');
  }

  function printReceipt(trx){
    const dt = new Date(trx.date);
    const methodLabel = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer Bank' }[trx.method];
    const area = document.getElementById('printArea');
    area.innerHTML = `
      <div class="pr-shop">${settings.shopName || 'Kasir Toko'}</div>
      <div class="pr-date">${dt.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})} ${dt.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div>
      <div class="pr-date">No. Struk: ${trx.id.slice(-6).toUpperCase()} · ${methodLabel}</div>
      <hr>
      ${trx.items.map(i=>`<div class="pr-row"><span>${i.qty}x ${i.name}</span><span>${fmt(i.subtotal)}</span></div>`).join('')}
      <hr>
      <div class="pr-row"><span>Subtotal</span><span>${fmt(trx.subtotal || trx.total)}</span></div>
      ${trx.discount ? `<div class="pr-row"><span>Diskon</span><span>${trx.discount.type==='percent' ? trx.discount.value+'%' : fmt(trx.discount.value)}</span></div>` : ''}
      ${trx.member ? `<div class="pr-row"><span>Member</span><span>${trx.member.discount}%</span></div>` : ''}
      <div class="pr-row pr-total"><span>Total</span><span>${fmt(trx.total)}</span></div>
      ${trx.method==='tunai' ? `<div class="pr-row"><span>Bayar</span><span>${fmt(trx.cashGiven)}</span></div><div class="pr-row"><span>Kembali</span><span>${fmt(trx.change)}</span></div>` : ''}
      <hr>
      <div class="pr-note">${settings.note || 'Terima kasih telah berbelanja'}</div>
    `;
    setTimeout(()=>{ window.print(); }, 50);
  }

  function shareWhatsApp(trx){
    const text = buildReceiptText(trx);
    const overlay = openModal(`
      <div class="modal-head"><h3>Kirim Struk ke WhatsApp</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body">
        <div class="field">
          <label>Nomor WhatsApp Pelanggan</label>
          <input type="tel" id="waNumberInput" placeholder="08123456789" inputmode="numeric" autofocus>
        </div>
        <p style="font-size:11.5px;color:var(--ink-soft);margin:0;">Boleh diawali 08 atau 62. Struk akan terbuka di WhatsApp, tinggal ketuk kirim.</p>
      </div>
      <div class="modal-foot">
        <button class="btn" id="mCancel" style="flex:1;">Batal</button>
        <button class="btn btn-outline-blue" id="mSendWa" style="flex:2;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zm12 6a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 3.9m0-11.8l-6.8 3.9"/></svg>
          Kirim Struk
        </button>
      </div>
    `);
    const input = $('#waNumberInput', overlay);
    const sendBtn = $('#mSendWa', overlay);
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mCancel', overlay).addEventListener('click', closeModal);
    input.addEventListener('keydown', e=>{ if (e.key === 'Enter') sendBtn.click(); });
    sendBtn.addEventListener('click', ()=>{
      const raw = input.value.trim();
      const digits = raw.replace(/[^0-9]/g,'');
      if (!digits){ toast('Masukkan nomor WhatsApp pelanggan'); input.focus(); return; }
      const waNumber = digits.startsWith('0') ? '62' + digits.slice(1) : (digits.startsWith('62') ? digits : '62' + digits);
      closeModal();
      openWaLink(text, waNumber);
    });
    setTimeout(()=> input.focus(), 50);
  }
  function openWaLink(text, waNumber){
    const url = 'https://wa.me/' + (waNumber || '') + '?text=' + encodeURIComponent(text);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ---------- Produk page ----------
  let produkSearchTerm = '';
  $('#produkSearch').addEventListener('input', e=>{ produkSearchTerm = e.target.value; renderProdukTable(); });
  $('#btnAddProduk').addEventListener('click', ()=> openProdukModal());

  function renderProdukTable(){
    const term = produkSearchTerm.trim().toLowerCase();
    const list = products.filter(p=> !term || p.name.toLowerCase().includes(term));
    if (!list.length){
      $('#produkTableWrap').innerHTML = `<div class="empty-state">Belum ada produk. Klik "Tambah Produk" untuk mulai.</div>`;
      return;
    }
    const editDelBtns = p => `
      <button class="icon-btn" data-act="edit" data-id="${p.id}" title="Edit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>
      <button class="icon-btn danger" data-act="del" data-id="${p.id}" title="Hapus">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
      </button>`;
    $('#produkTableWrap').innerHTML = `
      <table>
        <thead><tr><th>Nama Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th></th></tr></thead>
        <tbody>
          ${list.map(p=>`
            <tr>
              <td style="font-weight:600;">${p.name}</td>
              <td>${p.category}</td>
              <td class="num">${fmt(p.price)}</td>
              <td><span class="pill ${p.stock<=5?'low':''}">${p.stock}</span></td>
              <td style="text-align:right;">${editDelBtns(p)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="produk-cards">
        ${list.map(p=>`
          <div class="produk-card-item">
            <div class="pc-info">
              <div class="pc-name">${p.name}</div>
              <div class="pc-meta">${p.category} · <span class="${p.stock<=5?'low':''}" style="${p.stock<=5?'color:var(--danger);font-weight:600;':''}">Stok ${p.stock}</span></div>
              <div class="pc-price num">${fmt(p.price)}</div>
            </div>
            <div class="pc-actions">${editDelBtns(p)}</div>
          </div>`).join('')}
      </div>`;
    $$('[data-act="edit"]', $('#produkTableWrap')).forEach(b=> b.addEventListener('click', ()=> openProdukModal(b.dataset.id)));
    $$('[data-act="del"]', $('#produkTableWrap')).forEach(b=> b.addEventListener('click', ()=> deleteProduk(b.dataset.id)));
  }

  function openProdukModal(id){
    const editing = id ? products.find(p=>p.id===id) : null;
    const overlay = openModal(`
      <div class="modal-head"><h3>${editing?'Edit Produk':'Tambah Produk'}</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Nama Produk</label><input type="text" id="fName" value="${editing?editing.name:''}"></div>
        <div class="field"><label>Kategori</label><input type="text" id="fCat" value="${editing?editing.category:''}" placeholder="Makanan, Minuman, dll"></div>
        <div class="field"><label>Harga (Rp)</label><input type="number" id="fPrice" min="0" value="${editing?editing.price:''}" inputmode="numeric"></div>
        <div class="field"><label>Stok</label><input type="number" id="fStock" min="0" value="${editing?editing.stock:''}" inputmode="numeric"></div>
        <div class="field"><label>Barcode</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="fBarcode" value="${editing?editing.barcode||'' : ''}" placeholder="123456789012" style="flex:1;">
            <button class="btn" id="mGen">Generate</button>
            <button class="btn" id="mDl">Download</button>
          </div>
          <div id="barcodePreview" style="margin-top:10px;"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="mCancel" style="flex:1;">Batal</button>
        <button class="btn btn-primary" id="mSave" style="flex:2;">${editing?'Simpan Perubahan':'Tambah Produk'}</button>
      </div>
    `);
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mCancel', overlay).addEventListener('click', closeModal);
    $('#mSave', overlay).addEventListener('click', async ()=>{
      const name = $('#fName', overlay).value.trim();
      const category = $('#fCat', overlay).value.trim() || 'Umum';
      const price = Number($('#fPrice', overlay).value) || 0;
      const stock = Number($('#fStock', overlay).value) || 0;
      const barcode = ($('#fBarcode', overlay) && $('#fBarcode', overlay).value.trim()) || '';
      if (!name){ toast('Nama produk wajib diisi'); return; }
      if (editing){
        editing.name = name; editing.category = category; editing.price = price; editing.stock = stock;
        editing.barcode = barcode || editing.barcode;
      } else {
        products.push({ id: uid(), name, category, price, stock, barcode });
      }
      await saveProducts();
      closeModal();
      renderProdukTable();
      renderCatChips();
      renderProdGrid();
      toast('Produk disimpan');
    });

    // barcode generate / download handlers
    $('#mGen', overlay).addEventListener('click', ()=>{
      const code = ($('#fBarcode', overlay) && $('#fBarcode', overlay).value.trim()) || '';
      if (!code){ toast('Masukkan kode barcode'); return; }
      try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        JsBarcode(svg, code, { format: 'CODE128', displayValue: true, width: 2, height: 50 });
        const prev = $('#barcodePreview', overlay);
        prev.innerHTML = '';
        prev.appendChild(svg);
      } catch(e){ toast('Gagal membuat barcode'); }
    });
    $('#mDl', overlay).addEventListener('click', ()=>{
      const code = ($('#fBarcode', overlay) && $('#fBarcode', overlay).value.trim()) || '';
      if (!code){ toast('Masukkan kode barcode'); return; }
      try { downloadBarcode(code); } catch(e){ toast('Gagal download barcode'); }
    });
  }

  // Generate PNG from JsBarcode SVG and download
  function downloadBarcode(code){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    JsBarcode(svg, code, { format: 'CODE128', displayValue: true, width: 2, height: 60 });
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = function(){
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0);
      const png = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = png; a.download = 'barcode-'+code+'.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    img.onerror = function(){ toast('Gagal menghasilkan gambar'); };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  // Scan barcode using Quagga
  function openScannerModal(){
    const overlay = openModal(`
      <div class="modal-head"><h3>Scan Barcode</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body"><div id="scanner" style="width:100%;height:320px;background:#000"></div><div style="margin-top:8px;color:var(--ink-soft);font-size:12px">Arahkan kamera ke barcode / EAN</div></div>
      <div class="modal-foot"><button class="btn" id="mCancel">Batal</button></div>
    `, 'wide');
    const scannerEl = document.getElementById('scanner');
    try {
      Quagga.init({
        inputStream: { name: 'Live', type: 'LiveStream', target: scannerEl, constraints: { facingMode: 'environment' } },
        decoder: { readers: ['code_128_reader','ean_reader','ean_8_reader','upc_reader','upc_e_reader'] },
        locate: true
      }, function(err){
        if (err){ console.error(err); toast('Camera tidak tersedia atau izin ditolak'); return; }
        Quagga.start();
      });
      Quagga.onDetected(function(result){
        const code = result && result.codeResult && result.codeResult.code;
        if (code){
          try { Quagga.stop(); } catch(e){}
          closeModal();
          addToCartByBarcode(code);
        }
      });
    } catch(e){ toast('Scanner tidak tersedia'); }
    // cleanup on cancel/close
    document.getElementById('mCancel').addEventListener('click', ()=>{ try{ Quagga.stop(); }catch(e){}; closeModal(); });
    document.getElementById('mClose').addEventListener('click', ()=>{ try{ Quagga.stop(); }catch(e){}; closeModal(); });
  }

  function addToCartByBarcode(code){
    const p = products.find(x=>x.barcode && x.barcode === code);
    if (p){ addToCart(p.id); toast('Produk: '+p.name+' ditambahkan'); return; }
    toast('Produk dengan barcode ini tidak ditemukan. Silakan tambahkan produk.');
    // open add product modal with barcode prefilled
    setTimeout(()=>{ openProdukModal(); setTimeout(()=>{ const f = document.getElementById('fBarcode'); if(f) f.value = code; const gen = document.getElementById('mGen'); if(gen) gen.click(); }, 200); }, 300);
  }

  function openHardwareScannerModal(){
    const overlay = openModal(`
      <div class="modal-head"><h3>Scan (Alat)</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--ink-soft);">Gunakan barcode scanner (yang mengirim input sebagai keyboard). Arahkan kursor ke field di bawah, lalu lakukan scan.</p>
        <input id="hwScannerInput" autofocus style="width:100%;padding:10px;margin-top:12px;font-size:16px;">
        <div style="font-size:12px;color:var(--ink-soft);margin-top:8px;">Scanner biasanya mengirim <b>kode</b> diakhiri tombol Enter.</div>
      </div>
      <div class="modal-foot"><button class="btn" id="mCancel">Batal</button></div>
    `,'wide');
    const inp = document.getElementById('hwScannerInput');
    let buffer = '';
    let lastTime = 0;
    function onKey(e){
      const now = Date.now();
      if (now - lastTime > 120) buffer = ''; // reset if slow typing
      lastTime = now;
      if (e.key === 'Enter'){
        const code = buffer.trim(); buffer = '';
        if (code) { closeModal(); addToCartByBarcode(code); }
        e.preventDefault();
        return;
      }
      if (e.key && e.key.length === 1) buffer += e.key;
    }
    inp.focus();
    inp.addEventListener('keydown', onKey);
    document.getElementById('mCancel').addEventListener('click', ()=>{ inp.removeEventListener('keydown', onKey); closeModal(); });
    document.getElementById('mClose').addEventListener('click', ()=>{ inp.removeEventListener('keydown', onKey); closeModal(); });
  }

  function deleteProduk(id){
    const p = products.find(x=>x.id===id);
    const overlay = openModal(`
      <div class="modal-head"><h3>Hapus Produk</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body"><p style="font-size:13.5px;">Hapus "<b>${p?p.name:''}</b>" dari daftar produk? Tindakan ini tidak dapat dibatalkan.</p></div>
      <div class="modal-foot">
        <button class="btn" id="mCancel" style="flex:1;">Batal</button>
        <button class="btn btn-danger" id="mDel" style="flex:1;background:var(--danger);color:#fff;border-color:var(--danger);">Hapus</button>
      </div>
    `);
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mCancel', overlay).addEventListener('click', closeModal);
    $('#mDel', overlay).addEventListener('click', async ()=>{
      products = products.filter(x=>x.id!==id);
      await saveProducts();
      closeModal();
      renderProdukTable();
      renderCatChips();
      renderProdGrid();
      toast('Produk dihapus');
    });
  }

  // ---------- Riwayat page ----------
  let filterFrom = '', filterTo = '';
  $('#filterFrom').addEventListener('change', e=>{ filterFrom = e.target.value; renderRiwayat(); });
  $('#filterTo').addEventListener('change', e=>{ filterTo = e.target.value; renderRiwayat(); });
  $('#btnFilterReset').addEventListener('click', ()=>{ filterFrom=''; filterTo=''; $('#filterFrom').value=''; $('#filterTo').value=''; renderRiwayat(); });
  $('#btnExportCsv').addEventListener('click', exportCsv);

  function filteredTrx(){
    return transactions.filter(t=>{
      const d = t.date.slice(0,10);
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      return true;
    });
  }

  function renderRiwayat(){
    const list = filteredTrx();
    const omzet = list.reduce((s,t)=>s+t.total,0);
    const tunai = list.filter(t=>t.method==='tunai').reduce((s,t)=>s+t.total,0);
    const nonTunai = omzet - tunai;
    $('#summaryCards').innerHTML = `
      <div class="s-card"><div class="lbl">Total Omzet</div><div class="val num">${fmt(omzet)}</div></div>
      <div class="s-card"><div class="lbl">Jumlah Transaksi</div><div class="val num">${list.length}</div></div>
      <div class="s-card"><div class="lbl">Tunai</div><div class="val num" style="color:var(--amber);">${fmt(tunai)}</div></div>
      <div class="s-card"><div class="lbl">Non-Tunai</div><div class="val num" style="color:var(--blue);">${fmt(nonTunai)}</div></div>
    `;
    if (!list.length){
      $('#trxList').innerHTML = `<div class="empty-state">Belum ada transaksi pada rentang ini.</div>`;
      return;
    }
    $('#trxList').innerHTML = list.map(t=>{
      const dt = new Date(t.date);
      return `<div class="trx-item">
        <div class="trx-head" data-id="${t.id}">
          <span class="id">#${t.id.slice(-6)}</span>
          <span class="time">${dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}, ${dt.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span>
          <span class="method ${t.method}">${t.method==='tunai'?'Tunai':t.method==='qris'?'QRIS':'Transfer'}</span>
          <span class="total num">${fmt(t.total)}</span>
        </div>
        <div class="trx-detail">
          ${t.items.map(i=>`<div class="di"><span>${i.qty}x ${i.name}</span><span class="num">${fmt(i.subtotal)}</span></div>`).join('')}
          ${t.method==='tunai' ? `<div class="di"><span>Uang diterima</span><span class="num">${fmt(t.cashGiven)}</span></div><div class="di"><span>Kembalian</span><span class="num">${fmt(t.change)}</span></div>` : ''}
          <div class="post-actions">
            <button class="btn" data-act="print" data-id="${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>Cetak</button>
            <button class="btn btn-outline-blue" data-act="wa" data-id="${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zm12 6a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 3.9m0-11.8l-6.8 3.9"/></svg>WhatsApp</button>
          </div>
        </div>
      </div>`;
    }).join('');
    $$('.trx-head', $('#trxList')).forEach(h=>{
      h.addEventListener('click', ()=>{
        const detail = h.nextElementSibling;
        detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
      });
    });
    $$('[data-act="print"]', $('#trxList')).forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); const t = transactions.find(x=>x.id===b.dataset.id); if(t) printReceipt(t); }));
    $$('[data-act="wa"]', $('#trxList')).forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); const t = transactions.find(x=>x.id===b.dataset.id); if(t) shareWhatsApp(t); }));
  }

  function exportCsv(){
    const list = filteredTrx();
    if (!list.length){ toast('Tidak ada data untuk diekspor'); return; }
    let csv = 'ID,Tanggal,Waktu,Metode,Item,Total,Uang Diterima,Kembalian\n';
    list.forEach(t=>{
      const dt = new Date(t.date);
      const itemsStr = t.items.map(i=>`${i.qty}x ${i.name}`).join(' | ').replace(/,/g,';');
      csv += `${t.id},${dt.toLocaleDateString('id-ID')},${dt.toLocaleTimeString('id-ID')},${t.method},"${itemsStr}",${t.total},${t.cashGiven||''},${t.change||''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rekap-penjualan.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- Pengaturan page ----------
  function renderPengaturan(){
    $('#setShopName').value = settings.shopName || '';
    $('#setNote').value = settings.note || '';
    $('#setBank').value = settings.bank || '';
    $('#setWa').value = settings.wa || '';
    renderDiscountList();
    renderMemberList();
    renderQrisPreview();
    showSettingsHome();
  }

  function showSettingsHome(){
    $('#settingsHome').style.display = 'grid';
    $('#settingsInfo').classList.remove('active');
    $('#settingsQris').classList.remove('active');
    $('#settingsDiscount').classList.remove('active');
    $('#settingsMember').classList.remove('active');
  }

  function openSettingsSection(id){
    $('#settingsHome').style.display = 'none';
    $('#settingsInfo').classList.remove('active');
    $('#settingsQris').classList.remove('active');
    $('#settingsDiscount').classList.remove('active');
    $('#settingsMember').classList.remove('active');
    $(`#${id}`).classList.add('active');
  }

  function renderDiscountList(){
    $('#discountList').innerHTML = discounts.length ? discounts.map(d=>`<div class="promo-item"><strong>${d.name}</strong>${d.type==='percent' ? d.value+'% off' : fmt(d.value)+' off'}<div class="mini-muted">${d.type==='percent' ? 'Persen' : 'Nominal'}</div></div>`).join('') : '<div class="mini-muted">Belum ada diskon tersimpan.</div>';
  }

  function renderMemberList(){
    $('#memberList').innerHTML = members.length ? members.map(m=>`<div class="member-item"><strong>${m.name}</strong>${m.phone}<div class="mini-muted">Diskon ${m.discount}%</div></div>`).join('') : '<div class="mini-muted">Belum ada member tersimpan.</div>';
  }
  function renderQrisPreview(){
    if (settings.qris){
      $('#qrisPreviewWrap').innerHTML = `<img src="${settings.qris}">`;
      $('#qrisUploadLabel').textContent = 'Klik untuk ganti gambar QRIS';
    } else {
      $('#qrisPreviewWrap').innerHTML = '';
      $('#qrisUploadLabel').textContent = 'Klik untuk unggah gambar QRIS';
    }
  }
  $$('.settings-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      openSettingsSection('settings' + card.dataset.target.charAt(0).toUpperCase() + card.dataset.target.slice(1));
    });
  });
  $('#backFromInfo').addEventListener('click', showSettingsHome);
  $('#backFromQris').addEventListener('click', showSettingsHome);
  $('#backFromDiscount').addEventListener('click', showSettingsHome);
  $('#backFromMember').addEventListener('click', showSettingsHome);

  $('#qrisUploadZone').addEventListener('click', ()=> $('#qrisFileInput').click());
  $('#qrisFileInput').addEventListener('change', async e=>{
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      settings.qris = reader.result;
      await saveSettings();
      renderQrisPreview();
      toast('Gambar QRIS disimpan');
    };
    reader.readAsDataURL(file);
  });
  $('#btnSaveShop').addEventListener('click', async ()=>{
    settings.shopName = $('#setShopName').value.trim() || 'Kasir Toko';
    settings.note = $('#setNote').value.trim();
    await saveSettings();
    $('#shopNameDisplay').textContent = settings.shopName;
    toast('Info toko disimpan');
  });
  $('#btnSaveBank').addEventListener('click', async ()=>{
    settings.bank = $('#setBank').value.trim();
    await saveSettings();
    toast('Info rekening disimpan');
  });
  $('#btnSaveWa').addEventListener('click', async ()=>{
    settings.wa = $('#setWa').value.trim();
    await saveSettings();
    toast('Nomor WhatsApp disimpan');
  });
  $('#btnSaveDiscount').addEventListener('click', async ()=>{
    const name = $('#discountName').value.trim();
    const type = $('#discountType').value;
    const value = Number($('#discountValue').value);
    if (!name || !value) { toast('Isi nama dan nilai diskon'); return; }
    discounts.push({ id: uid(), name, type, value });
    await saveDiscounts();
    $('#discountName').value = '';
    $('#discountValue').value = '';
    renderDiscountList();
    toast('Diskon disimpan');
  });
  $('#btnSaveMember').addEventListener('click', async ()=>{
    const name = $('#memberName').value.trim();
    const phone = $('#memberPhone').value.trim();
    const discount = Number($('#memberDiscount').value);
    if (!name || !phone) { toast('Isi nama dan nomor member'); return; }
    members.push({ id: uid(), name, phone, discount: discount || 0 });
    await saveMembers();
    $('#memberName').value = '';
    $('#memberPhone').value = '';
    $('#memberDiscount').value = '';
    renderMemberList();
    toast('Member disimpan');
  });

  // ---------- PWA Install ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
  });
  function isAppInstalled(){
    try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (document.referrer && document.referrer.startsWith('android-app://')); } catch(e){ return false; }
  }
  window.addEventListener('appinstalled', ()=>{ try{ const b = document.getElementById('btnInstall'); if(b) b.style.display='none'; localStorage.setItem('tranzivo_installed','1'); if (typeof toast === 'function') toast('Aplikasi terpasang'); }catch(e){} });
  try {
    const manifest = {
      name: settings.shopName || 'Kasir Toko',
      short_name: 'Kasir',
      start_url: '.',
      display: 'standalone',
      background_color: '#FAF7F0',
      theme_color: '#0F6B4C',
      icons: []
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  } catch(e){ /* manifest injection not supported in this context */ }

  $('#btnInstall').addEventListener('click', async ()=>{
    if (deferredPrompt){
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch(e){}
      deferredPrompt = null;
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const overlay = openModal(`
      <div class="modal-head"><h3>Pasang Aplikasi</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body" style="font-size:13.5px;line-height:1.7;">
        ${isIOS ? `
          <p>Di iPhone/iPad (Safari):</p>
          <ol style="padding-left:18px;">
            <li>Ketuk ikon <b>Share</b> (kotak dengan panah ke atas)</li>
            <li>Pilih <b>Add to Home Screen / Tambah ke Layar Utama</b></li>
            <li>Ketuk <b>Add</b> — ikon kasir akan muncul di layar utama</li>
          </ol>` : `
          <p>Di Android (Chrome) atau desktop:</p>
          <ol style="padding-left:18px;">
            <li>Buka menu titik tiga (⋮) di browser</li>
            <li>Pilih <b>Install app / Tambahkan ke layar Utama</b></li>
            <li>Ikuti instruksi hingga selesai</li>
          </ol>`}
        <p style="color:var(--ink-soft);margin-top:10px;">Jika opsi instal tidak muncul, aplikasi tetap bisa digunakan langsung dari browser seperti biasa — data tetap tersimpan otomatis.</p>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-block" id="mOk">Mengerti</button></div>
    `);
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mOk', overlay).addEventListener('click', closeModal);
  });

  // ---------- Init ----------
  async function init(){
    updateClock();
    await loadAll();
    $('#shopNameDisplay').textContent = settings.shopName || 'Kasir Toko';
    renderCatChips();
    renderProdGrid();
    renderCart();
    // Hide install button if app is already installed / standalone
    try { const btn = $('#btnInstall'); if (btn){ if (isAppInstalled() || localStorage.getItem('tranzivo_installed')) btn.style.display = 'none'; else btn.style.display = 'flex'; } } catch(e){}
    // Hide splash after initialization
    try {
      const s = document.getElementById('pwa-splash');
      if (s){ setTimeout(()=>{ s.classList.add('hide'); setTimeout(()=>{ if (s.parentNode) s.parentNode.removeChild(s); }, 500); }, 700); }
    } catch(e){}
  }
  init();
  // Unified scan chooser: on mobile show a choice, on desktop keep separate actions
  function openScanChooser(){
    const overlay = openModal(`
      <div class="modal-head"><h3>Pilih Metode Scan</h3><button class="modal-close" id="mClose">✕</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Pilih bagaimana Anda ingin melakukan pemindaian barcode:</p>
        <div style="display:flex;gap:10px;flex-direction:column">
          <button class="btn btn-primary" id="useCamera">Pakai Kamera (Camera)</button>
          <button class="btn" id="useHardware">Pakai Alat (Scanner Keyboard)</button>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" id="mCancel">Batal</button></div>
    `, 'wide');
    $('#mClose', overlay).addEventListener('click', closeModal);
    $('#mCancel', overlay).addEventListener('click', closeModal);
    $('#useCamera', overlay).addEventListener('click', ()=>{ closeModal(); openScannerModal(); });
    $('#useHardware', overlay).addEventListener('click', ()=>{ closeModal(); openHardwareScannerModal(); });
  }

  // attach scan button(s)
  try {
    const bs = document.getElementById('btnScan');
    const bhw = document.getElementById('btnScanHw');
    if (bs){
      bs.addEventListener('click', ()=>{
        if (window.innerWidth <= 860) openScanChooser();
        else openScannerModal();
      });
    }
    if (bhw){
      // on small screens we hide the separate hardware button to present a single unified action
      if (window.innerWidth <= 860) bhw.style.display = 'none';
      bhw.addEventListener('click', ()=>{
        if (window.innerWidth <= 860) openScanChooser();
        else openHardwareScannerModal();
      });
    }
  } catch(e){}
})();
