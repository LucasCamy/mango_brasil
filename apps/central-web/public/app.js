// Burger Tech - Central Web & PDV Assistido
let globalProducts = [];
let globalOrders = [];
let globalCategories = [];
let globalShift = null;
let currentTab = 'pdv';
let pdvCart = [];
let pdvPaymentMethod = 'CASH';
let pdvCategoryFilter = 'all';

// ==========================================
// TAB SWITCHER
// ==========================================
function switchTab(tabId) {
  currentTab = tabId;

  const tabs = ['pdv', 'kds', 'caixa', 'overview', 'cardapio', 'totens', 'fiscal', 'usuarios', 'config'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    const nav = document.getElementById('nav-' + t);
    if (el) el.classList.toggle('hidden', t !== tabId);
    if (nav) {
      if (t === tabId) {
        nav.className = "nav-btn w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold";
      } else {
        nav.className = "nav-btn w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-slate-400 hover:text-white hover:bg-slate-800/60 font-semibold";
      }
    }
  });

  const titles = {
    pdv: '🛒 PDV Assistido (Caixa Balcão)',
    kds: '👨‍🍳 KDS Cozinha (Fila de Produção)',
    caixa: '💰 Gestão de Caixa & Turnos',
    overview: '📊 Visão Geral & Métricas',
    cardapio: '🍔 Cardápio & Preços',
    totens: '🖥️ Totens & Manutenção',
    fiscal: '🧾 Motor Fiscal NFC-e (SEFAZ)',
    usuarios: '👥 Usuários & Permissões',
    config: '⚙️ Configurações da Empresa'
  };

  const pageTitle = document.getElementById('page-title');
  if (pageTitle && titles[tabId]) {
    pageTitle.innerHTML = titles[tabId];
  }

  if (tabId === 'pdv') renderPdvProducts();
  if (tabId === 'kds') loadKdsOrders();
  if (tabId === 'caixa') loadCashShift();
  if (tabId === 'overview') loadOrders();
  if (tabId === 'cardapio') renderProductsCatalog();
  if (tabId === 'totens') loadTotems();
  if (tabId === 'fiscal') loadFiscalInvoices();
}

// ==========================================
// DATA FETCHING & INITIALIZATION
// ==========================================
async function loadAll() {
  await Promise.all([
    loadCategories(),
    loadProducts(),
    loadOrders(),
    loadCashShift(),
    loadTotems()
  ]);
  switchTab(currentTab);
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    globalCategories = await res.json();
  } catch (e) { console.error(e); }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    globalProducts = await res.json();
  } catch (e) { console.error(e); }
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    globalOrders = await res.json();
    renderOverviewOrders();
    updateOverviewStats();
    loadKdsOrders();
  } catch (e) { console.error(e); }
}

async function loadCashShift() {
  try {
    const res = await fetch('/api/shifts/current');
    const data = await res.json();
    if (data.open && data.shift) {
      globalShift = data.shift;
      document.getElementById('header-cash').innerText = `R$ ${globalShift.finalCalculatedCash.toFixed(2).replace('.', ',')}`;
      document.getElementById('caixa-saldo-dinheiro').innerText = `R$ ${globalShift.finalCalculatedCash.toFixed(2).replace('.', ',')}`;

      // Calculate totals for card & pix from shift reconciliation
      const cardTotal = (globalShift.reconciliation.find(r => r.method === 'CREDIT_CARD')?.systemCalculatedAmount || 0) +
                        (globalShift.reconciliation.find(r => r.method === 'DEBIT_CARD')?.systemCalculatedAmount || 0);
      const pixTotal = globalShift.reconciliation.find(r => r.method === 'PIX')?.systemCalculatedAmount || 0;

      document.getElementById('caixa-total-cartao').innerText = `R$ ${cardTotal.toFixed(2).replace('.', ',')}`;
      document.getElementById('caixa-total-pix').innerText = `R$ ${pixTotal.toFixed(2).replace('.', ',')}`;

      renderCashMovements(globalShift.movements);
    }
  } catch (e) { console.error(e); }
}

// ==========================================
// 1. PDV ASSISTIDO LOGIC
// ==========================================
function filterPdvCategory(catId) {
  pdvCategoryFilter = catId;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    if (btn.dataset.cat === catId) {
      btn.className = "cat-pill px-3 py-1.5 rounded-xl font-semibold bg-amber-500 text-black shadow-sm";
    } else {
      btn.className = "cat-pill px-3 py-1.5 rounded-xl font-semibold bg-slate-900 text-slate-300 hover:text-white border border-slate-800";
    }
  });
  renderPdvProducts();
}

function renderPdvProducts() {
  const grid = document.getElementById('pdv-products-grid');
  if (!grid) return;

  grid.innerHTML = '';
  let list = globalProducts.filter(p => p.active);
  if (pdvCategoryFilter !== 'all') {
    list = list.filter(p => p.categoryId === pdvCategoryFilter);
  }

  list.forEach(p => {
    const card = document.createElement('div');
    card.className = "p-3 rounded-2xl bg-[#0d1322] border border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all flex flex-col justify-between group shadow-sm";
    card.onclick = () => addProductToPdvCart(p);

    card.innerHTML = `
      <div>
        <div class="h-28 rounded-xl overflow-hidden mb-2.5 bg-slate-950 relative">
          <img src="${p.imageUrl}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-sm text-amber-400 font-extrabold text-xs font-mono">
            R$ ${p.basePrice.toFixed(2).replace('.', ',')}
          </span>
        </div>
        <h4 class="font-bold text-white text-xs leading-tight mb-1">${p.name}</h4>
        <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">${p.description}</p>
      </div>
      <button class="mt-3 w-full py-1.5 rounded-xl bg-slate-900 hover:bg-amber-500 hover:text-black text-amber-400 font-bold text-xs border border-slate-800 transition-colors flex items-center justify-center gap-1.5">
        <span>+</span> Adicionar ao Carrinho
      </button>
    `;

    grid.appendChild(card);
  });
}

function addProductToPdvCart(product) {
  const existing = pdvCart.find(i => i.product.id === product.id);
  if (existing) {
    existing.quantity += 1;
    existing.totalPrice = existing.quantity * existing.product.basePrice;
  } else {
    pdvCart.push({
      product,
      quantity: 1,
      totalPrice: product.basePrice
    });
  }
  renderPdvCart();
}

function updatePdvCartQty(idx, delta) {
  pdvCart[idx].quantity += delta;
  if (pdvCart[idx].quantity <= 0) {
    pdvCart.splice(idx, 1);
  } else {
    pdvCart[idx].totalPrice = pdvCart[idx].quantity * pdvCart[idx].product.basePrice;
  }
  renderPdvCart();
}

function clearPdvCart() {
  pdvCart = [];
  renderPdvCart();
}

function renderPdvCart() {
  const container = document.getElementById('pdv-cart-items');
  if (!container) return;

  if (pdvCart.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-center py-8">Nenhum item adicionado. Clique nos produtos para vender.</div>`;
    document.getElementById('pdv-subtotal').innerText = 'R$ 0,00';
    document.getElementById('pdv-ibpt').innerText = 'R$ 0,00';
    document.getElementById('pdv-total').innerText = 'R$ 0,00';
    calculateChange();
    return;
  }

  container.innerHTML = '';
  let subtotal = 0;
  let ibpt = 0;

  pdvCart.forEach((item, idx) => {
    subtotal += item.totalPrice;
    ibpt += item.totalPrice * ((item.product.fiscal?.aliquotaIbpt || 18) / 100);

    const div = document.createElement('div');
    div.className = "p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2";

    div.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="font-bold text-white truncate text-xs">${item.product.name}</div>
        <div class="text-[10px] text-amber-400 font-mono">R$ ${item.product.basePrice.toFixed(2).replace('.', ',')} un.</div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button onclick="updatePdvCartQty(${idx}, -1)" class="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold">-</button>
        <span class="w-6 text-center font-mono font-bold text-xs">${item.quantity}</span>
        <button onclick="updatePdvCartQty(${idx}, 1)" class="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold">+</button>
      </div>
      <div class="font-mono font-bold text-xs text-white shrink-0 w-16 text-right">
        R$ ${item.totalPrice.toFixed(2).replace('.', ',')}
      </div>
    `;

    container.appendChild(div);
  });

  document.getElementById('pdv-subtotal').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
  document.getElementById('pdv-ibpt').innerText = `R$ ${ibpt.toFixed(2).replace('.', ',')}`;
  document.getElementById('pdv-total').innerText = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

  calculateChange();
}

function setPdvPaymentMethod(method) {
  pdvPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    if (btn.id === 'pay-btn-' + method) {
      btn.className = "pay-method-btn p-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold text-[11px] text-center";
    } else {
      btn.className = "pay-method-btn p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 font-bold text-[11px] text-center";
    }
  });

  const cashBox = document.getElementById('cash-calc-box');
  if (cashBox) {
    cashBox.style.display = method === 'CASH' ? 'block' : 'none';
  }
}

function calculateChange() {
  const total = pdvCart.reduce((acc, i) => acc + i.totalPrice, 0);
  const given = Number(document.getElementById('cash-given-input')?.value || 0);
  const changeEl = document.getElementById('cash-change-val');

  if (given >= total && total > 0) {
    const diff = given - total;
    changeEl.innerText = `R$ ${diff.toFixed(2).replace('.', ',')}`;
    changeEl.className = "text-emerald-400 font-bold";
  } else {
    changeEl.innerText = "R$ 0,00";
    changeEl.className = "text-amber-400 font-bold";
  }
}

async function finalizePdvOrder() {
  if (pdvCart.length === 0) {
    alert('Adicione pelo menos um produto ao pedido!');
    return;
  }

  const btn = document.getElementById('btn-finalize-pdv');
  btn.disabled = true;
  btn.innerHTML = `<span>⏳</span> Emitindo NFC-e & Enviando...`;

  const total = pdvCart.reduce((acc, i) => acc + i.totalPrice, 0);
  const cpf = document.getElementById('pdv-cpf')?.value.trim() || undefined;

  const payload = {
    origin: 'PDV_ASSISTED',
    clientCpf: cpf,
    items: pdvCart.map((i, idx) => ({
      id: 'item-' + (idx + 1),
      productId: i.product.id,
      productName: i.product.name,
      unitPrice: i.product.basePrice,
      quantity: i.quantity,
      totalPrice: i.totalPrice,
      fiscal: i.product.fiscal
    })),
    payments: [
      {
        id: 'pay-' + Date.now(),
        method: pdvPaymentMethod,
        amount: total,
        status: 'APPROVED',
        paidAt: new Date().toISOString()
      }
    ]
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Falha ao processar venda');
    const order = await res.json();

    clearPdvCart();
    await loadAll();

    // Show DANFE modal
    openDanfe(order.id);
  } catch (err) {
    alert('Erro ao finalizar pedido: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🚀</span> Finalizar Venda & Emitir NFC-e`;
  }
}

// ==========================================
// 2. KDS COZINHA LOGIC
// ==========================================
async function loadKdsOrders() {
  const grid = document.getElementById('kds-grid');
  const badge = document.getElementById('kds-badge');
  if (!grid) return;

  try {
    const res = await fetch('/api/orders/kds');
    const orders = await res.json();

    if (badge) badge.innerText = orders.length;

    grid.innerHTML = '';
    if (orders.length === 0) {
      grid.innerHTML = `
        <div class="col-span-3 text-center py-16 text-slate-500 font-mono">
          👨‍🍳 Nenhum pedido pendente na cozinha. Tudo entregue!
        </div>
      `;
      return;
    }

    orders.forEach(o => {
      const card = document.createElement('div');
      const isPreparing = o.status === 'PREPARING';
      const isReady = o.status === 'READY';

      card.className = `p-4 rounded-2xl bg-[#0d1322] border ${
        isReady ? 'border-emerald-500/60 shadow-lg shadow-emerald-500/10' :
        (isPreparing ? 'border-amber-500/60 shadow-lg shadow-amber-500/10' : 'border-slate-800')
      } space-y-3 flex flex-col justify-between`;

      const itemsHtml = o.items.map(it => `
        <div class="py-1 border-b border-slate-800/60 flex items-start justify-between text-xs">
          <span class="font-bold text-white">${it.quantity}x ${it.productName}</span>
          <span class="text-slate-400 font-mono text-[11px]">R$ ${it.totalPrice.toFixed(2)}</span>
        </div>
      `).join('');

      card.innerHTML = `
        <div class="space-y-2">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800">
            <span class="font-extrabold text-2xl text-amber-400 font-mono">#${o.publicTicketNumber}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isReady ? 'bg-emerald-500/20 text-emerald-400' :
              (isPreparing ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400')
            }">
              ${o.status}
            </span>
          </div>
          <div class="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Origem: <strong>${o.origin}</strong></span>
            <span class="font-mono">Criado há ${formatTime(o.createdAt)}</span>
          </div>
          <div class="pt-1 space-y-1">
            ${itemsHtml}
          </div>
        </div>

        <div class="pt-3 border-t border-slate-800 flex gap-2">
          ${o.status === 'RECEIVED' ? `
            <button onclick="updateOrderStatus('${o.id}', 'PREPARING')" class="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors">
              Iniciar Preparo 🍳
            </button>
          ` : ''}
          ${o.status === 'PREPARING' ? `
            <button onclick="updateOrderStatus('${o.id}', 'READY')" class="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-colors">
              Marcar como Pronto 🔔
            </button>
          ` : ''}
          ${o.status === 'READY' ? `
            <button onclick="updateOrderStatus('${o.id}', 'DELIVERED')" class="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs transition-colors">
              Entregar ao Cliente ✔
            </button>
          ` : ''}
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (e) { console.error(e); }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    await loadOrders();
  } catch (e) {
    alert('Erro ao atualizar status: ' + e.message);
  }
}

// ==========================================
// 3. CAIXA & TURNOS LOGIC
// ==========================================
function renderCashMovements(movements) {
  const tbody = document.getElementById('caixa-movimentos-tbody');
  if (!tbody || !movements) return;

  tbody.innerHTML = '';
  movements.slice().reverse().forEach(m => {
    const isSangria = m.type === 'BLEED_SANGRIA';
    const isSuprimento = m.type === 'SUPPLY' || m.type === 'INITIAL_SUPPLY';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-900/60";

    tr.innerHTML = `
      <td class="p-3 text-slate-400">${new Date(m.createdAt).toLocaleTimeString()}</td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
          isSangria ? 'bg-red-500/20 text-red-400' :
          (isSuprimento ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400')
        }">
          ${m.type}
        </span>
      </td>
      <td class="p-3 text-slate-200 font-sans">${m.description}</td>
      <td class="p-3 text-slate-400 font-sans">${m.operatorName}</td>
      <td class="p-3 text-right font-bold ${isSangria ? 'text-red-400' : 'text-emerald-400'}">
        ${isSangria ? '-' : '+'} R$ ${m.amount.toFixed(2).replace('.', ',')}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function openSangriaModal() {
  document.getElementById('sangria-modal').classList.remove('hidden');
}
function closeSangriaModal() {
  document.getElementById('sangria-modal').classList.add('hidden');
}

async function executeSangria() {
  const amount = Number(document.getElementById('sangria-amount').value);
  const desc = document.getElementById('sangria-desc').value.trim();

  if (!amount || amount <= 0 || !desc) {
    alert('Informe o valor e a justificativa da sangria!');
    return;
  }

  try {
    const res = await fetch('/api/shifts/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'BLEED_SANGRIA', amount, description: desc })
    });
    if (!res.ok) throw new Error('Falha ao processar sangria');
    closeSangriaModal();
    await loadCashShift();
    alert('Sangria de R$ ' + amount.toFixed(2) + ' realizada com sucesso!');
  } catch (e) {
    alert(e.message);
  }
}

function openSuprimentoModal() {
  document.getElementById('suprimento-modal').classList.remove('hidden');
}
function closeSuprimentoModal() {
  document.getElementById('suprimento-modal').classList.add('hidden');
}

async function executeSuprimento() {
  const amount = Number(document.getElementById('suprimento-amount').value);
  const desc = document.getElementById('suprimento-desc').value.trim();

  if (!amount || amount <= 0 || !desc) {
    alert('Informe o valor e a justificativa do suprimento!');
    return;
  }

  try {
    const res = await fetch('/api/shifts/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SUPPLY', amount, description: desc })
    });
    if (!res.ok) throw new Error('Falha ao processar suprimento');
    closeSuprimentoModal();
    await loadCashShift();
    alert('Suprimento de R$ ' + amount.toFixed(2) + ' adicionado ao caixa!');
  } catch (e) {
    alert(e.message);
  }
}

function openFechamentoModal() {
  document.getElementById('fechamento-modal').classList.remove('hidden');
}
function closeFechamentoModal() {
  document.getElementById('fechamento-modal').classList.add('hidden');
}

async function executeFechamentoTurno() {
  const declaredCash = Number(document.getElementById('close-cash-declared').value || 0);
  const declaredDebit = Number(document.getElementById('close-debit-declared').value || 0);
  const declaredCredit = Number(document.getElementById('close-credit-declared').value || 0);
  const declaredPix = Number(document.getElementById('close-pix-declared').value || 0);

  try {
    const res = await fetch('/api/shifts/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ declaredCash, declaredDebit, declaredCredit, declaredPix })
    });
    if (!res.ok) throw new Error('Falha ao fechar turno');
    const closed = await res.json();
    closeFechamentoModal();
    await loadCashShift();

    const diff = closed.cashDifference;
    let diffMsg = diff === 0 ? "Caixa bateu perfeitamente!" : (diff > 0 ? `Sobra de caixa: R$ ${diff.toFixed(2)}` : `Quebra de caixa: R$ ${Math.abs(diff).toFixed(2)}`);
    alert(`Turno Fechado com Sucesso!\n\nRelatório Z emitido.\nTotal Declarado em Dinheiro: R$ ${declaredCash.toFixed(2)}\nSaldo Calculado: R$ ${closed.finalCalculatedCash.toFixed(2)}\n${diffMsg}`);
  } catch (e) {
    alert(e.message);
  }
}

// ==========================================
// 4. OVERVIEW & INVOICES
// ==========================================
function renderOverviewOrders() {
  const tbody = document.getElementById('overview-orders-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  globalOrders.forEach(o => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-900/60";

    const itemsSummary = o.items.map(i => `${i.quantity}x ${i.productName}`).join(', ');
    const pay = o.payments[0] ? o.payments[0].method : 'PENDENTE';

    tr.innerHTML = `
      <td class="p-3 font-extrabold text-amber-400">#${o.publicTicketNumber}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold">${o.origin}</span></td>
      <td class="p-3 text-slate-200 font-sans truncate max-w-xs">${itemsSummary}</td>
      <td class="p-3 font-bold text-white">R$ ${o.total.toFixed(2).replace('.', ',')}</td>
      <td class="p-3 text-slate-400 font-mono text-[11px]">${pay}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-bold">${o.status}</span></td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">${o.nfceStatus || 'AUTORIZADA'}</span></td>
      <td class="p-3 text-right">
        <button onclick="openDanfe('${o.id}')" class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-bold text-[10px]">
          Ver DANFE
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function updateOverviewStats() {
  const totalRev = globalOrders.reduce((acc, o) => acc + o.total, 0);
  const revEl = document.getElementById('ov-faturamento');
  const pedEl = document.getElementById('ov-pedidos');
  if (revEl) revEl.innerText = `R$ ${totalRev.toFixed(2).replace('.', ',')}`;
  if (pedEl) pedEl.innerText = globalOrders.length;
}

function renderProductsCatalog() {
  const grid = document.getElementById('products-catalog-grid');
  if (!grid) return;

  grid.innerHTML = '';
  globalProducts.forEach(p => {
    const card = document.createElement('div');
    card.className = "p-4 rounded-2xl bg-[#0d1322] border border-slate-800 space-y-3";

    card.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${p.imageUrl}" alt="${p.name}" class="w-16 h-16 rounded-xl object-cover bg-slate-950" />
        <div class="min-w-0 flex-1">
          <h4 class="font-bold text-white text-sm truncate">${p.name}</h4>
          <span class="text-amber-400 font-mono font-bold text-xs">R$ ${p.basePrice.toFixed(2).replace('.', ',')}</span>
          <p class="text-[10px] font-mono text-slate-500">NCM: ${p.fiscal.ncm} &bull; CFOP: ${p.fiscal.cfop}</p>
        </div>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
        <span class="text-slate-400">Disponível no Cardápio:</span>
        <button onclick="toggleProduct('${p.id}')" class="px-3 py-1 rounded-full text-[10px] font-bold font-mono transition-colors ${
          p.active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'
        }">
          ${p.active ? 'ATIVADO ●' : 'DESATIVADO ○'}
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
}

async function toggleProduct(id) {
  try {
    await fetch(`/api/products/${id}/toggle`, { method: 'PATCH' });
    await loadProducts();
    renderProductsCatalog();
    renderPdvProducts();
  } catch (e) { console.error(e); }
}

async function loadTotems() {
  const grid = document.getElementById('totems-list-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/totems');
    const totems = await res.json();
    grid.innerHTML = '';

    totems.forEach(t => {
      const card = document.createElement('div');
      card.className = "p-5 rounded-2xl bg-[#0d1322] border border-slate-800 space-y-3";

      card.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <span class="text-xl">🖥️</span>
            <div>
              <h4 class="font-bold text-white text-sm">${t.name}</h4>
              <p class="text-[10px] font-mono text-slate-400">IP: ${t.ipAddress} &bull; v${t.appVersion}</p>
            </div>
          </div>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            ${t.status}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs font-mono">
          <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span class="text-slate-500 text-[10px] block">Impressora Térmica:</span>
            <span class="text-emerald-400 font-bold">${t.printerStatus}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <span class="text-slate-500 text-[10px] block">Pinpad TEF:</span>
            <span class="text-cyan-400 font-bold">${t.pinpadStatus}</span>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <a href="/totem" target="_blank" class="flex-1 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-bold text-center text-xs border border-blue-500/30">
            Abrir Simulador
          </a>
          <button onclick="alert('Totem reiniciado remotamente com sucesso!')" class="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs">
            Reiniciar
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (e) { console.error(e); }
}

function loadFiscalInvoices() {
  const tbody = document.getElementById('fiscal-invoices-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  globalOrders.forEach(o => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-900/60";

    tr.innerHTML = `
      <td class="p-3 font-bold text-amber-400 font-mono">#${o.publicTicketNumber}</td>
      <td class="p-3 font-mono text-[11px] text-slate-300 truncate max-w-sm" title="${o.nfceKey || 'Chave simulada'}">
        ${o.nfceKey || '50241112345678000190650010000001021873912834'}
      </td>
      <td class="p-3 font-bold text-white">R$ ${o.total.toFixed(2).replace('.', ',')}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">AUTORIZADA</span></td>
      <td class="p-3 text-right">
        <button onclick="openDanfe('${o.id}')" class="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px]">
          Ver DANFE NFC-e
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// ==========================================
// 5. DANFE NFC-E MODAL
// ==========================================
function openDanfe(orderId) {
  const order = globalOrders.find(o => o.id === orderId);
  if (!order) return;

  const itemsContainer = document.getElementById('danfe-items-list');
  itemsContainer.innerHTML = '';

  let totalQtd = 0;
  order.items.forEach(it => {
    totalQtd += it.quantity;
    itemsContainer.innerHTML += `
      <div class="flex justify-between">
        <span>${it.quantity}x ${it.productName}</span>
        <span>R$ ${it.totalPrice.toFixed(2)}</span>
      </div>
    `;
  });

  document.getElementById('danfe-qtd').innerText = totalQtd;
  document.getElementById('danfe-total').innerText = `R$ ${order.total.toFixed(2).replace('.', ',')}`;
  document.getElementById('danfe-payment').innerText = order.payments[0] ? order.payments[0].method : 'DINHEIRO';
  document.getElementById('danfe-key').innerText = order.nfceKey || '50241112345678000190650010000001021873912834';
  document.getElementById('danfe-datetime').innerText = new Date(order.createdAt).toLocaleString('pt-BR');

  document.getElementById('danfe-modal').classList.remove('hidden');
}

function closeDanfeModal() {
  document.getElementById('danfe-modal').classList.add('hidden');
}

function formatTime(isoString) {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    return `${Math.floor(diff / 3600)} h`;
  } catch (e) { return ''; }
}

// Init
loadAll();
setInterval(loadOrders, 4000);
