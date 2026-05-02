// ── STATE ──
let currentUser = null;
let products = [];
let currentProduct = null;
let cartOpen = false;
let adminModeActive = false;
let activeCategory = 'Fortnite'; // filtre catégorie actif — Fortnite par défaut

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  initParticles();
  initCodeInputs();
  initStarInput();
  initCategoryFilter();
  await loadUser();
  await loadProducts();
  initNav();
});

// ── NAVIGATION ──
function initNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === 'discord') {
        navigate('discord');
      } else {
        navigate(page);
      }
    });
  });
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  const link = document.querySelector(`[data-page="${page}"]`);
  if (link) link.classList.add('active');

  if (page === 'services') loadProducts();
  if (page === 'library') renderLibrary();

  closeCart();
  window.scrollTo(0, 0);
}

// ── USER ──
async function loadUser() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
    renderUser();
  } catch (e) {
    console.error('loadUser error:', e);
  }
}

function renderUser() {
  const connectBtn = document.getElementById('connectBtn');
  const userInfo = document.getElementById('userInfo');
  const cartBtn = document.getElementById('cartBtn');
  const adminFab = document.getElementById('adminFab');

  if (currentUser) {
    connectBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    cartBtn.style.display = 'flex';

    const avatar = currentUser.avatar
      ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    document.getElementById('userAvatar').src = avatar;
    document.getElementById('userName').textContent = currentUser.username;

    // Notification badge
    const unseen = (currentUser.purchases || []).filter(p => !p.seen).length;
    const badge = document.getElementById('cartBadge');
    if (unseen > 0) {
      badge.style.display = 'flex';
      badge.textContent = unseen;
    } else {
      badge.style.display = 'none';
    }

    // Admin FAB
    if (currentUser.isOwner) {
      adminFab.style.display = 'flex';
    }

    // Cart click
    document.getElementById('cartBtn').onclick = toggleCart;
  } else {
    connectBtn.style.display = 'flex';
    userInfo.style.display = 'none';
    cartBtn.style.display = 'none';
    adminFab.style.display = 'none';
  }
}

// ── LOGIN MODAL ──
function openLoginModal() {
  // Reset les inputs
  document.querySelectorAll('.code-digit').forEach(i => { i.value = ''; i.classList.remove('filled'); });
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.querySelector('.code-digit').focus(), 100);
}

function initCodeInputs() {
  const digits = document.querySelectorAll('.code-digit');
  digits.forEach((input, idx) => {
    input.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val) {
        e.target.classList.add('filled');
        if (idx < digits.length - 1) digits[idx + 1].focus();
        else submitVerifyCode();
      } else {
        e.target.classList.remove('filled');
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        digits[idx - 1].focus();
        digits[idx - 1].value = '';
        digits[idx - 1].classList.remove('filled');
      }
      // Coller un code complet
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          const nums = text.replace(/\D/g, '').slice(0, 6);
          digits.forEach((d, i) => {
            d.value = nums[i] || '';
            d.classList.toggle('filled', !!nums[i]);
          });
          if (nums.length === 6) submitVerifyCode();
          else digits[Math.min(nums.length, 5)].focus();
        });
      }
    });
  });
}

async function submitVerifyCode() {
  const digits = document.querySelectorAll('.code-digit');
  const code = Array.from(digits).map(d => d.value).join('');
  if (code.length < 6) return;

  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();

    if (data.success) {
      closeModal('loginModal');
      showToast('✅ Connecté ! Rafraîchis la page.');
      // Auto-refresh après 1s
      setTimeout(() => window.location.reload(), 1000);
    } else {
      errEl.textContent = data.error || 'Code invalide.';
      errEl.style.display = 'block';
      digits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
      digits[0].focus();
    }
  } catch {
    errEl.textContent = 'Erreur réseau.';
    errEl.style.display = 'block';
  }
}

function logout() {
  window.location.href = '/auth/logout';
}

// ── CATEGORY FILTER ──
function initCategoryFilter() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderProducts();
    });
  });
}

// ── PRODUCTS ──
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    products = await res.json();
    renderProducts();
  } catch (e) {
    console.error('loadProducts error:', e);
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  const filtered = products.filter(p => p.category === activeCategory);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">${activeCategory === 'all' ? 'Aucun produit disponible.' : `Aucun produit dans la catégorie "${activeCategory}".`}</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" onclick="openProduct('${p.id}')">
      ${p.image
        ? `<img src="${p.image}" alt="${p.name}" class="product-card-img" onerror="this.style.display='none'" />`
        : `<div class="product-card-img-placeholder">📦</div>`
      }
      <div class="product-card-body">
        <div class="product-card-name">${escHtml(p.name)}</div>
        <div class="product-card-desc">${escHtml(p.description)}</div>
        <div class="product-card-footer">
          <span class="product-card-price">${p.price > 0 ? `€${p.price.toFixed(2)}` : 'Gratuit'}</span>
          <button class="product-card-btn">Voir →</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  if (!grid) return;

  if (!currentUser) {
    grid.innerHTML = '<div class="empty-state">Connecte-toi pour voir ta library.</div>';
    return;
  }

  const purchases = currentUser.purchases || [];
  if (purchases.length === 0) {
    grid.innerHTML = '<div class="empty-state">Tu n\'as encore rien acheté.</div>';
    return;
  }

  grid.innerHTML = purchases.map(p => `
    <div class="library-card">
      ${p.productImage
        ? `<img src="${p.productImage}" alt="${p.productName}" class="library-card-img" onerror="this.style.display='none'" />`
        : `<div class="product-card-img-placeholder" style="height:140px">📦</div>`
      }
      <div class="library-card-body">
        <div class="library-card-name">${escHtml(p.productName)}</div>
        <span class="library-go-btn" onclick="navigate('services')">Go to library</span>
        <a href="${p.downloadUrl}" target="_blank" class="library-dl-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Télécharger
        </a>
      </div>
    </div>
  `).join('');
}

// ── PRODUCT PAGE (plein écran) ──
let selectedRating = 0;

async function openProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  currentProduct = product;

  // Remplir les infos
  document.getElementById('ppName').textContent = product.name;
  document.getElementById('ppPrice').textContent = product.price > 0 ? `€${product.price.toFixed(2)}` : 'Gratuit';
  document.getElementById('ppDescription').textContent = product.description;

  const img = document.getElementById('ppImage');
  const placeholder = document.getElementById('ppImgPlaceholder');
  if (product.image) {
    img.src = product.image;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }

  // Vérifier si l'utilisateur a acheté ce produit
  const owned = currentUser && (currentUser.purchases || []).find(p => p.productId === product.id);
  const buyBtn = document.getElementById('ppBuyBtn');
  const dlBtn = document.getElementById('ppDownloadBtn');

  // Buy Now rouge TOUJOURS — le download est uniquement dans la Library
  buyBtn.style.display = 'block';
  dlBtn.style.display = 'none';

  // Section admin — visible seulement si owner ET mode admin activé
  const adminSection = document.getElementById('ppAdminSection');
  adminSection.style.display = (currentUser && currentUser.isOwner && adminModeActive) ? 'block' : 'none';

  // Formulaire avis (si connecté)
  const reviewForm = document.getElementById('reviewForm');
  reviewForm.style.display = currentUser ? 'block' : 'none';

  // Charger les reviews
  await loadReviews(product.id);

  // Naviguer vers la page produit
  navigate('product');
  window.scrollTo(0, 0);
}

function closeProductPage() {
  navigate('services');
}

// ── REVIEWS ──
async function loadReviews(productId) {
  try {
    const res = await fetch(`/api/products/${productId}/reviews`);
    const reviews = await res.json();
    renderReviews(reviews);
    renderRatingBadge(reviews);
  } catch (e) {
    console.error('loadReviews:', e);
  }
}

function renderReviews(reviews) {
  const container = document.getElementById('reviewsList');
  if (reviews.length === 0) {
    container.innerHTML = '<div class="no-reviews">Aucun avis pour le moment. Sois le premier !</div>';
    return;
  }

  container.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-header">
        <img src="${r.avatar ? `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}"
          class="review-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
        <div style="flex:1">
          <div class="review-username">${escHtml(r.username)}</div>
          <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
        </div>
        <div class="review-date">${new Date(r.createdAt).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="review-comment">${escHtml(r.comment)}</div>
    </div>
  `).join('');
}

function renderRatingBadge(reviews) {
  const el = document.getElementById('ppRating');
  if (reviews.length === 0) {
    el.innerHTML = '<span style="color:rgba(255,255,255,0.2)">☆☆☆☆☆</span> <span>Aucun avis</span>';
    return;
  }
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const stars = Math.round(avg);
  el.innerHTML = `<span style="color:#fbbf24">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span> <span>${avg.toFixed(1)} (${reviews.length} avis)</span>`;
}

function initStarInput() {
  const stars = document.querySelectorAll('.star-btn');
  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const v = parseInt(star.dataset.v);
      stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.v) <= v));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.v) <= selectedRating));
    });
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.v);
      stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.v) <= selectedRating));
    });
  });
}

async function submitReview() {
  if (!currentProduct) return;
  if (selectedRating === 0) { showToast('⚠️ Choisis une note entre 1 et 5 étoiles.'); return; }
  const comment = document.getElementById('reviewComment').value.trim();
  if (comment.length < 3) { showToast('⚠️ Commentaire trop court.'); return; }

  try {
    const res = await fetch(`/api/products/${currentProduct.id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, comment })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('reviewComment').value = '';
      selectedRating = 0;
      document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));
      await loadReviews(currentProduct.id);
      showToast('✅ Avis publié !');
    } else {
      showToast('❌ ' + (data.error || 'Erreur'));
    }
  } catch { showToast('❌ Erreur réseau.'); }
}

// ── BUY ──
function openBuyModal() {
  if (!currentUser) {
    openLoginModal();
    return;
  }
  document.getElementById('buyModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

async function confirmBuy() {
  const email = document.getElementById('buyEmail').value.trim();
  if (!email || !email.includes('@')) { showToast('⚠️ Entre un email valide.'); return; }
  if (!currentProduct) return;

  try {
    const res = await fetch(`/api/buy/${currentProduct.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('buyModal');
      await loadUser();
      renderUser();
      showToast('✅ Achat confirmé ! Retrouve ton produit dans ta Library.');
    } else {
      showToast('❌ ' + (data.error || 'Erreur lors de l\'achat.'));
    }
  } catch { showToast('❌ Erreur réseau.'); }
}

// ── EDIT PRODUCT ──
function openEditModal() {
  if (!currentProduct) return;
  document.getElementById('eName').value = currentProduct.name;
  document.getElementById('ePrice').value = currentProduct.price;
  document.getElementById('eImageUrl').value = currentProduct.image || '';
  document.getElementById('eImageUrl').dataset.cleared = '';
  document.getElementById('eDownload').value = currentProduct.downloadUrl;
  document.getElementById('eDesc').value = currentProduct.description;
  document.getElementById('eCategory').value = currentProduct.category || '';
  document.getElementById('eImageFile').value = '';

  // Afficher l'image actuelle dans la preview
  const preview = document.getElementById('eImagePreview');
  if (currentProduct.image) {
    preview.src = currentProduct.image;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  document.getElementById('editModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function previewEditImage(input) {
  const preview = document.getElementById('eImagePreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
    reader.readAsDataURL(input.files[0]);
    document.getElementById('eImageUrl').value = '';
  }
}

function removeEditImage() {
  document.getElementById('eImageUrl').value = '';
  document.getElementById('eImageFile').value = '';
  document.getElementById('eImagePreview').style.display = 'none';
  // Marquer l'image comme supprimée avec une valeur vide explicite
  document.getElementById('eImageUrl').dataset.cleared = 'true';
}

async function saveEdit() {
  if (!currentProduct) return;
  const formData = new FormData();
  formData.append('name', document.getElementById('eName').value.trim());
  formData.append('price', document.getElementById('ePrice').value.trim());
  formData.append('downloadUrl', document.getElementById('eDownload').value.trim());
  formData.append('description', document.getElementById('eDesc').value.trim());
  formData.append('category', document.getElementById('eCategory').value);

  const imageFile = document.getElementById('eImageFile').files[0];
  const imageUrl = document.getElementById('eImageUrl').value.trim();
  if (imageFile) formData.append('image', imageFile);
  else formData.append('imageUrl', imageUrl);

  try {
    const res = await fetch(`/api/admin/products/${currentProduct.id}`, { method: 'PUT', body: formData });
    const data = await res.json();
    if (data.success) {
      closeModal('editModal');
      // Mettre à jour localement
      const idx = products.findIndex(p => p.id === currentProduct.id);
      if (idx !== -1) products[idx] = data.product;
      currentProduct = data.product;
      // Rafraîchir la page produit
      await openProduct(currentProduct.id);
      showToast('✅ Produit modifié !');
    } else {
      showToast('❌ ' + (data.error || 'Erreur'));
    }
  } catch { showToast('❌ Erreur réseau.'); }
}

async function deleteProduct() {
  if (!currentProduct) return;
  if (!confirm(`Supprimer "${currentProduct.name}" ? Cette action est irréversible.`)) return;

  try {
    const res = await fetch(`/api/admin/products/${currentProduct.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      products = products.filter(p => p.id !== currentProduct.id);
      currentProduct = null;
      navigate('services');
      showToast('🗑️ Produit supprimé.');
    }
  } catch { showToast('❌ Erreur réseau.'); }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  // Ne remettre overflow que si aucune autre modal n'est ouverte
  const anyOpen = ['buyModal','loginModal','banModal','editModal'].some(
    mid => mid !== id && document.getElementById(mid)?.style.display === 'flex'
  );
  if (!anyOpen) document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    closeModal(e.target.id);
  }
});

// ── CART ──
function toggleCart() {
  cartOpen = !cartOpen;
  const dropdown = document.getElementById('cartDropdown');
  dropdown.style.display = cartOpen ? 'block' : 'none';

  if (cartOpen) {
    renderCartDropdown();
    // Mark as seen
    if (currentUser) {
      fetch('/api/purchases/seen', { method: 'POST' }).then(() => {
        document.getElementById('cartBadge').style.display = 'none';
      });
    }
  }
}

function closeCart() {
  cartOpen = false;
  document.getElementById('cartDropdown').style.display = 'none';
}

function renderCartDropdown() {
  const container = document.getElementById('cartItems');
  if (!currentUser || !currentUser.purchases || currentUser.purchases.length === 0) {
    container.innerHTML = '<div class="cart-empty">Aucun achat pour le moment.</div>';
    return;
  }

  container.innerHTML = currentUser.purchases.map(p => `
    <div class="cart-item">
      ${p.productImage
        ? `<img src="${p.productImage}" alt="${p.productName}" class="cart-item-img" onerror="this.style.display='none'" />`
        : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem">📦</div>`
      }
      <div>
        <div class="cart-item-name">${escHtml(p.productName)}</div>
        <button onclick="navigate('library');closeCart()" class="library-go-btn" style="font-size:0.72rem;padding:0;margin-top:4px">Go to library →</button>
      </div>
    </div>
  `).join('');
}

// Close cart on outside click
document.addEventListener('click', e => {
  if (cartOpen && !e.target.closest('#cartDropdown') && !e.target.closest('#cartBtn')) {
    closeCart();
  }
});

// ── ADMIN ──
function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function toggleAdminMode(checkbox) {
  adminModeActive = checkbox.checked;
  const form = document.getElementById('addProductForm');
  const ipSection = document.getElementById('ipLogsSection');
  form.style.display = adminModeActive ? 'block' : 'none';
  ipSection.style.display = adminModeActive ? 'block' : 'none';
  if (adminModeActive) {
    loadIpLogs();
    loadBans();
  }
  // Mettre à jour les boutons admin sur la page produit si elle est ouverte
  if (currentProduct) {
    const adminSection = document.getElementById('ppAdminSection');
    if (adminSection) adminSection.style.display = (currentUser && currentUser.isOwner && adminModeActive) ? 'block' : 'none';
  }
}

function previewImage(input) {
  const preview = document.getElementById('imagePreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
    document.getElementById('pImageUrl').value = '';
  }
}

// ── ADMIN IP LOGS ──
async function loadIpLogs() {
  try {
    const res = await fetch('/api/admin/iplogs');
    if (!res.ok) return;
    const logs = await res.json();
    const container = document.getElementById('ipLogsList');

    if (logs.length === 0) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:12px 0">Aucun utilisateur connecté pour le moment.</p>';
      return;
    }

    container.innerHTML = logs.map(log => `
      <div class="ip-log-row" id="iprow-${btoa(log.ip)}">
        <div class="ip-log-left">
          ${log.avatar
            ? `<img src="https://cdn.discordapp.com/avatars/${log.userId}/${log.avatar}.png" class="ip-log-avatar" onerror="this.style.display='none'" />`
            : `<div class="ip-log-avatar" style="background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:0.8rem">?</div>`
          }
          <div>
            <div class="ip-log-name">${escHtml(log.username)}</div>
            <div class="ip-log-ip">${escHtml(log.ip)}</div>
          </div>
        </div>
        ${log.banned
          ? `<span style="font-size:0.72rem;color:#f87171;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);padding:3px 8px;border-radius:4px">Banni</span>`
          : `<button class="btn-ban-ip" onclick="openBanModal('${escHtml(log.ip)}','${escHtml(log.username)}')">Bannir</button>`
        }
      </div>
    `).join('');
  } catch (e) {
    console.error('loadIpLogs:', e);
  }
}

async function loadBans() {
  try {
    const res = await fetch('/api/admin/bans');
    if (!res.ok) return;
    const bans = await res.json();
    const container = document.getElementById('bansList');

    if (bans.length === 0) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:12px 0">Aucune IP bannie.</p>';
      return;
    }

    container.innerHTML = bans.map(ban => `
      <div class="ban-row">
        <div>
          <div class="ip-log-name" style="font-size:0.82rem">${escHtml(ban.username)}</div>
          <div class="ip-log-ip">${escHtml(ban.ip)}</div>
          ${ban.raison ? `<div style="font-size:0.72rem;color:rgba(255,255,255,0.3);margin-top:2px">${escHtml(ban.raison)}</div>` : ''}
        </div>
        <button class="btn-unban-ip" onclick="unbanIp('${escHtml(ban.ip)}')">Débannir</button>
      </div>
    `).join('');
  } catch (e) {
    console.error('loadBans:', e);
  }
}

let pendingBanIp = null;
let pendingBanUsername = null;

function openBanModal(ip, username) {
  pendingBanIp = ip;
  pendingBanUsername = username;
  document.getElementById('banModalIp').textContent = `IP : ${ip}  •  ${username}`;
  document.getElementById('banReason').value = '';
  document.getElementById('banModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

async function confirmBanIp() {
  if (!pendingBanIp) return;
  const raison = document.getElementById('banReason').value.trim();

  try {
    const res = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: pendingBanIp, username: pendingBanUsername, raison })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('banModal');
      showToast(`🔨 IP ${pendingBanIp} bannie.`);
      pendingBanIp = null;
      pendingBanUsername = null;
      loadIpLogs();
      loadBans();
    }
  } catch (e) {
    alert('Erreur réseau.');
  }
}

async function unbanIp(ip) {
  if (!confirm(`Débannir l'IP ${ip} ?`)) return;
  try {
    const res = await fetch(`/api/admin/ban/${encodeURIComponent(ip)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ IP ${ip} débannie.`);
      loadIpLogs();
      loadBans();
    }
  } catch (e) {
    alert('Erreur réseau.');
  }
}

async function submitProduct() {
  const name = document.getElementById('pName').value.trim();
  const price = document.getElementById('pPrice').value.trim();
  const category = document.getElementById('pCategory').value;
  const imageUrl = document.getElementById('pImageUrl').value.trim();
  const imageFile = document.getElementById('pImageFile').files[0];
  const downloadUrl = document.getElementById('pDownload').value.trim();
  const description = document.getElementById('pDesc').value.trim();

  if (!name || !downloadUrl || !description) {
    alert('Remplis au moins le nom, la description et le lien de téléchargement.');
    return;
  }
  if (!category) {
    alert('Choisis une catégorie.');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('price', price || '0');
  formData.append('category', category);
  formData.append('downloadUrl', downloadUrl);
  formData.append('description', description);
  if (imageFile) {
    formData.append('image', imageFile);
  } else if (imageUrl) {
    formData.append('imageUrl', imageUrl);
  }

  try {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('pName').value = '';
      document.getElementById('pPrice').value = '';
      document.getElementById('pCategory').value = '';
      document.getElementById('pImageUrl').value = '';
      document.getElementById('pImageFile').value = '';
      document.getElementById('pDownload').value = '';
      document.getElementById('pDesc').value = '';
      document.getElementById('imagePreview').style.display = 'none';

      await loadProducts();
      showToast('✅ Produit ajouté avec succès !');
    } else {
      alert(data.error || 'Erreur lors de l\'ajout.');
    }
  } catch (e) {
    alert('Erreur réseau.');
  }
}

// ── TOAST ──
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:32px;right:32px;z-index:9999;
    background:#0d0d10;border:1px solid rgba(124,58,237,0.4);
    color:#fff;padding:14px 20px;border-radius:10px;
    font-size:0.85rem;font-family:'Inter',sans-serif;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:slideIn 0.3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── UTILS ──
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── PARTICLES ──
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;
  const mouse = { x: -9999, y: -9999 };

  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    const count = Math.floor((W * H) / 14000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.2 + 0.8
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const maxDist = 150;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const dx = p.x - particles[j].x;
        const dy = p.y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.25;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      // Mouse interaction
      const mdx = p.x - mouse.x;
      const mdy = p.y - mouse.y;
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mdist < maxDist * 1.5) {
        const alpha = (1 - mdist / (maxDist * 1.5)) * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); createParticles(); });
  resize();
  createParticles();
  draw();
}
