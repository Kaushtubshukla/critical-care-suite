// Main Critical Care Mobile App Controller
// Integrated with Firebase Client Services & Dynamic GitHub Modules Engine

import { SIMULATOR_CATEGORIES, PRO_FEATURES } from '../data/simulators.js';
import { subscriptionManager, SUBSCRIPTION_EVENT } from './subscription.js';
import { disclaimerManager, DISCLAIMER_EVENT } from './disclaimer.js';
import { PresentationController } from './presentation-ctrl.js';
import { modulesService } from './services/modules-service.js';
import { firebaseService } from './services/firebase-service.js';

export class App {
  constructor() {
    this.simulators = modulesService.getPublishedModules();
    this.categories = JSON.parse(JSON.stringify(SIMULATOR_CATEGORIES));
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.activeTab = 'hub'; // 'hub', 'favorites', 'pro', 'about'
    this.favorites = this.loadFavorites();
    this.recents = this.loadRecents();
    this.activeSimulator = null;
    this.presentationCtrl = null;
  }

  init() {
    this.presentationCtrl = new PresentationController(this);
    this.presentationCtrl.init();

    this.refreshCategoriesCount();
    this.renderCategoryChips();
    this.renderSimulatorsHub();
    this.renderFavoritesView();
    this.renderProFeaturesList();
    this.populateQuickJumpSelect();
    this.bindAppEvents();
    this.updateSubscriptionUI();
    this.updateUserAuthUI();
    this.checkFirstLaunchDisclaimer();
    this.initPushNotifications();

    // Listen for live module changes from Admin Dashboard / GitHub publish
    window.addEventListener('cch:modules-updated', (e) => {
      this.simulators = e.detail;
      this.refreshCategoriesCount();
      this.renderCategoryChips();
      this.renderSimulatorsHub();
      this.renderFavoritesView();
      this.populateQuickJumpSelect();
      this.showToast('🔄 Simulator library updated live!', 'info');
    });

    // Listen for User Auth / VIP change
    window.addEventListener('cch:auth-changed', () => {
      this.updateUserAuthUI();
      this.updateSubscriptionUI();
    });

    // Set active tab default
    this.switchTab('hub');
  }

  refreshCategoriesCount() {
    this.categories.forEach(cat => {
      if (cat.id === 'all') {
        cat.count = this.simulators.length;
      } else {
        cat.count = this.simulators.filter(s => s.category === cat.id).length;
      }
    });

    // Update hero banner count
    const heroStat = document.getElementById('heroSimulatorCountText');
    if (heroStat) {
      heroStat.textContent = `${this.simulators.length} ICU Simulators`;
    }
  }

  loadFavorites() {
    try {
      const saved = localStorage.getItem('cc_favorites');
      return saved ? JSON.parse(saved) : ['hypoxic-patient', 'ards-active', 'cardiac-rhythm'];
    } catch (e) {
      return ['hypoxic-patient', 'ards-active'];
    }
  }

  saveFavorites() {
    try {
      localStorage.setItem('cc_favorites', JSON.stringify(this.favorites));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    this.renderFavoritesView();
    this.updateFavoriteButtons();
  }

  toggleFavorite(simId, e) {
    if (e) e.stopPropagation();
    if (this.favorites.includes(simId)) {
      this.favorites = this.favorites.filter(id => id !== simId);
      this.showToast('Removed from Saved', 'info');
    } else {
      this.favorites.push(simId);
      this.showToast('⭐ Added to Saved Simulators', 'success');
    }
    this.saveFavorites();
    this.renderSimulatorsHub();
  }

  loadRecents() {
    try {
      const saved = localStorage.getItem('cc_recents');
      return saved ? JSON.parse(saved) : ['hypoxic-patient', 'copd-ards-atlas'];
    } catch (e) {
      return [];
    }
  }

  recordRecent(simId) {
    this.recents = [simId, ...this.recents.filter(id => id !== simId)].slice(0, 8);
    try {
      localStorage.setItem('cc_recents', JSON.stringify(this.recents));
    } catch (e) {
      console.warn(e);
    }
    this.renderFavoritesView();
  }

  checkFirstLaunchDisclaimer() {
    if (!disclaimerManager.isAccepted) {
      this.showDisclaimerModal();
    }
  }

  showDisclaimerModal() {
    const modal = document.getElementById('disclaimerModal');
    if (modal) {
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  hideDisclaimerModal() {
    const modal = document.getElementById('disclaimerModal');
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  showPaywallModal(triggerSimulator = null) {
    const modal = document.getElementById('paywallModal');
    if (!modal) return;

    const subTitleEl = document.getElementById('paywallTriggerTitle');
    if (subTitleEl && triggerSimulator) {
      subTitleEl.textContent = `Unlock "${triggerSimulator.title}" & all ${this.simulators.length} clinical simulation engines.`;
    } else if (subTitleEl) {
      subTitleEl.textContent = `Unlock unrestricted access to all ${this.simulators.length} critical care simulation engines.`;
    }

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  hidePaywallModal() {
    const modal = document.getElementById('paywallModal');
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // --- Auth & Account Modal ---
  showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('show');
      this.updateAuthModalFields();
    }
  }

  hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  updateUserAuthUI() {
    const user = firebaseService.currentUser;
    const authBtn = document.getElementById('headerAuthBtn');
    const userStatusPill = document.getElementById('userStatusPill');

    if (authBtn) {
      if (user) {
        authBtn.innerHTML = `
          <div class="user-avatar-small">${user.displayName.charAt(0)}</div>
          <span class="user-name-small">${user.displayName.split(' ')[0]}</span>
        `;
      } else {
        authBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Sign In</span>
        `;
      }
    }
  }

  updateAuthModalFields() {
    const user = firebaseService.currentUser;
    const loggedInView = document.getElementById('authLoggedInView');
    const loggedOutView = document.getElementById('authLoggedOutView');

    if (user && loggedInView && loggedOutView) {
      loggedInView.style.display = 'block';
      loggedOutView.style.display = 'none';

      document.getElementById('profileDisplayName').textContent = user.displayName;
      document.getElementById('profileEmail').textContent = user.email;
      
      const badge = document.getElementById('profileTierBadge');
      if (user.isVIP) {
        badge.textContent = '⭐ VIP PRO MEMBER';
        badge.className = 'badge-vip';
      } else if (user.tier === 'pro') {
        badge.textContent = '💎 PRO SUBSCRIBER';
        badge.className = 'badge-pro';
      } else {
        badge.textContent = 'FREE DEMO USER';
        badge.className = 'badge-free';
      }
    } else if (loggedInView && loggedOutView) {
      loggedInView.style.display = 'none';
      loggedOutView.style.display = 'block';
    }
  }

  renderCategoryChips() {
    const container = document.getElementById('categoryChipsContainer');
    if (!container) return;

    // Dynamic categories supporting standard + custom categories
    const baseCategories = [
      { id: 'all', name: 'All Tools' },
      { id: 'respiratory', name: 'Respiratory' },
      { id: 'neuro', name: 'Neurocritical' },
      { id: 'cardiac', name: 'Cardiac & Shock' },
      { id: 'abg', name: 'ABG Diagnostics' }
    ];
    const knownCatIds = new Set(baseCategories.map(c => c.id));
    this.simulators.forEach(sim => {
      if (sim.category && !knownCatIds.has(sim.category)) {
        knownCatIds.add(sim.category);
        baseCategories.push({
          id: sim.category,
          name: sim.categoryLabel || `${sim.category.charAt(0).toUpperCase() + sim.category.slice(1)} Care`
        });
      }
    });

    this.categories = baseCategories;

    container.innerHTML = this.categories
      .map(cat => {
        const isActive = cat.id === this.activeCategory;
        const count = cat.id === 'all' 
          ? this.simulators.length 
          : this.simulators.filter(s => s.category === cat.id).length;
        return `
          <button class="chip-btn ${isActive ? 'active' : ''}" data-category-id="${cat.id}">
            <span>${cat.name}</span>
            <span class="chip-count">${count}</span>
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const catId = e.currentTarget.getAttribute('data-category-id');
        this.activeCategory = catId;
        this.renderCategoryChips();
        this.renderSimulatorsHub();
      });
    });
  }

  getFilteredSimulators() {
    return this.simulators.filter(sim => {
      const matchesCat = this.activeCategory === 'all' || sim.category === this.activeCategory;
      const q = this.searchQuery.toLowerCase().trim();
      if (!q) return matchesCat;

      const matchesSearch = 
        sim.title.toLowerCase().includes(q) ||
        (sim.subtitle && sim.subtitle.toLowerCase().includes(q)) ||
        (sim.description && sim.description.toLowerCase().includes(q)) ||
        (sim.tags && sim.tags.some(t => t.toLowerCase().includes(q)));

      return matchesCat && matchesSearch;
    });
  }

  renderSimulatorsHub() {
    const container = document.getElementById('simulatorsListContainer');
    if (!container) return;

    const filtered = this.getFilteredSimulators();
    const isPro = subscriptionManager.isPro();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No Clinical Simulators Found</h3>
          <p>No tools matched "${this.escapeHtml(this.searchQuery)}". Try clearing your search or picking another category.</p>
          <button class="btn btn-secondary" id="clearSearchBtn">Clear Search</button>
        </div>
      `;
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.searchQuery = '';
          const input = document.getElementById('simSearchInput');
          if (input) input.value = '';
          this.activeCategory = 'all';
          this.renderCategoryChips();
          this.renderSimulatorsHub();
        });
      }
      return;
    }

    // Find latest simulator (marked isLatest, or having newest publishedAt)
    const latestSim = this.simulators.find(s => s.isLatest) ||
      this.simulators.filter(s => s.publishedAt).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];

    let latestBannerHtml = '';
    if (latestSim && this.activeCategory === 'all' && !this.searchQuery) {
      const isUnlocked = isPro || (latestSim.tier === 'free');
      latestBannerHtml = `
        <div class="latest-simulator-banner" data-launch-id="${latestSim.id}">
          <div class="latest-banner-header">
            <div class="latest-badge-wrap">
              <span class="pulse-dot"></span>
              <span class="latest-badge-text">✨ LATEST SIMULATOR ADDED</span>
            </div>
            <span class="latest-cat-pill">${latestSim.categoryLabel || latestSim.category}</span>
          </div>
          <div class="latest-banner-body">
            <div class="latest-banner-text">
              <h3 class="latest-banner-title">${latestSim.title}</h3>
              <p class="latest-banner-desc">${latestSim.description || latestSim.subtitle}</p>
            </div>
            <div class="latest-banner-action">
              <button class="btn-latest-launch" data-launch-id="${latestSim.id}">
                <span>${isUnlocked ? '🚀 Launch Latest Tool' : '🔒 Unlock Latest'}</span>
                <span class="arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // If "all" category is selected and no search query, group by categories for clean structured hierarchy
    if (this.activeCategory === 'all' && !this.searchQuery) {
      const baseCategories = [
        { id: 'respiratory', title: 'Respiratory Critical Care', badge: 'Ventilator & Oxygenation' },
        { id: 'neuro', title: 'Neurocritical Care', badge: 'BTF & Stroke Algorithms' },
        { id: 'cardiac', title: 'Cardiac Critical Care & Shock', badge: 'ECG & Hemodynamics' },
        { id: 'abg', title: 'ABG Diagnostics', badge: 'Camera OCR & 6-Step' }
      ];

      const knownCatIds = new Set(baseCategories.map(c => c.id));
      const sections = baseCategories.map(cat => ({
        ...cat,
        list: filtered.filter(s => s.category === cat.id)
      }));

      // Gather any custom or newly published categories dynamically
      const otherSims = filtered.filter(s => !knownCatIds.has(s.category));
      const otherCatsMap = {};
      otherSims.forEach(sim => {
        const catKey = sim.category || 'other';
        if (!otherCatsMap[catKey]) {
          otherCatsMap[catKey] = {
            id: catKey,
            title: sim.categoryLabel || `${catKey.charAt(0).toUpperCase() + catKey.slice(1)} Critical Care`,
            badge: 'Clinical Simulation',
            list: []
          };
        }
        otherCatsMap[catKey].list.push(sim);
      });
      Object.values(otherCatsMap).forEach(catSec => sections.push(catSec));

      // In each category section, sort so the newest simulator (isLatest or newest publishedAt) is placed at the top!
      sections.forEach(sec => {
        sec.list.sort((a, b) => {
          if (a.isLatest) return -1;
          if (b.isLatest) return 1;
          if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt) - new Date(a.publishedAt);
          if (a.publishedAt) return -1;
          if (b.publishedAt) return 1;
          return 0;
        });
      });

      const activeSections = sections.filter(sec => sec.list.length > 0);

      container.innerHTML = `
        ${latestBannerHtml}
        ${activeSections
          .map(sec => `
            <div class="sim-section" id="cat-section-${sec.id}">
              <div class="section-header">
                <div>
                  <h3 class="section-title">${sec.title}</h3>
                  <span class="section-badge">${sec.badge}</span>
                </div>
                <span class="section-count">${sec.list.length} Tools</span>
              </div>
              <div class="sim-cards-grid">
                ${sec.list.map(sim => this.createSimulatorCardHtml(sim, isPro)).join('')}
              </div>
            </div>
          `)
          .join('')}
      `;
    } else {
      // Flat grid for filtered/searched results sorted by newest first
      filtered.sort((a, b) => {
        if (a.isLatest) return -1;
        if (b.isLatest) return 1;
        if (a.publishedAt && b.publishedAt) return new Date(b.publishedAt) - new Date(a.publishedAt);
        if (a.publishedAt) return -1;
        if (b.publishedAt) return 1;
        return 0;
      });

      container.innerHTML = `
        <div class="sim-cards-grid">
          ${filtered.map(sim => this.createSimulatorCardHtml(sim, isPro)).join('')}
        </div>
      `;
    }

    this.bindSimulatorCardActions(container);
  }

  createSimulatorCardHtml(sim, isPro) {
    const isFree = sim.tier === 'free';
    const isUnlocked = isFree || isPro;
    const isFav = this.favorites.includes(sim.id);
    const isLatest = sim.isLatest || sim.isNewRelease;

    const latestPill = isLatest 
      ? `<span class="badge-latest-pill"><span class="pulse-dot"></span> ✨ LATEST SIMULATOR</span>` 
      : '';

    return `
      <div class="sim-card ${isUnlocked ? 'unlocked' : 'locked'} ${isLatest ? 'is-latest-card' : ''}" data-sim-id="${sim.id}">
        <div class="sim-card-top">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <div class="sim-badge ${isUnlocked ? (isFree ? 'badge-free' : 'badge-pro-unlocked') : 'badge-pro-locked'}">
              ${isUnlocked 
                ? (isFree ? '🟢 FREE ACCESS' : '💎 PRO UNLOCKED') 
                : '🔒 PRO LOCKED'}
            </div>
            ${latestPill}
          </div>
          <button class="fav-btn ${isFav ? 'favorited' : ''}" data-fav-id="${sim.id}" title="Toggle Favorite" aria-label="Favorite">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
          </button>
        </div>

        <div class="sim-card-body">
          <div class="sim-header-row">
            <div class="sim-icon-box" style="background: ${sim.iconBg || '#0284c7'}">
              ${this.getCategoryIconSvg(sim.category)}
            </div>
            <div class="sim-header-text">
              <h4 class="sim-title">${sim.title}</h4>
              <span class="sim-subtitle">${sim.subtitle || 'Clinical Decision Engine'}</span>
            </div>
          </div>

          <p class="sim-desc">${sim.description || 'Interactive bedside medical simulation.'}</p>

          <div class="sim-tags">
            ${(sim.tags || ['ICU Simulation']).map(tag => `<span class="sim-tag">${tag}</span>`).join('')}
          </div>

          <div class="sim-meta-row">
            <span class="sim-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${sim.duration || '10 min'}
            </span>
            <span class="sim-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
              ${sim.casesCount || 'Interactive Case'}
            </span>
          </div>
        </div>

        <div class="sim-card-footer">
          <button class="sim-action-btn ${isUnlocked ? 'btn-launch' : 'btn-unlock'}" data-launch-id="${sim.id}">
            ${isUnlocked ? '<span>Launch Simulator</span><span class="arrow">→</span>' : '<span>Unlock with Pro</span><span class="lock-icon">🔒</span>'}
          </button>
        </div>
      </div>
    `;
  }

  getCategoryIconSvg(category) {
    switch (category) {
      case 'respiratory':
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`;
      case 'neuro':
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z"/></svg>`;
      case 'cardiac':
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
      case 'abg':
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
      default:
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
    }
  }

  bindSimulatorCardActions(container) {
    container.querySelectorAll('[data-launch-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const simId = e.currentTarget.getAttribute('data-launch-id');
        this.launchSimulator(simId);
      });
    });

    container.querySelectorAll('.sim-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.fav-btn')) return;
        const simId = card.getAttribute('data-sim-id');
        this.launchSimulator(simId);
      });
    });

    container.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const simId = btn.getAttribute('data-fav-id');
        this.toggleFavorite(simId, e);
      });
    });
  }

  launchSimulator(simId) {
    const sim = this.simulators.find(s => s.id === simId);
    if (!sim) return;

    const isPro = subscriptionManager.isPro();
    const isUnlocked = sim.tier === 'free' || isPro;

    if (!isUnlocked) {
      this.showPaywallModal(sim);
      return;
    }

    this.activeSimulator = sim;
    this.recordRecent(sim.id);

    const viewer = document.getElementById('simulatorViewer');
    const iframe = document.getElementById('simulatorIframe');
    const titleEl = document.getElementById('viewerTitle');
    const catBadge = document.getElementById('viewerCategoryBadge');

    if (!viewer || !iframe) return;

    if (titleEl) titleEl.textContent = sim.title;
    if (catBadge) catBadge.textContent = sim.categoryLabel || sim.category;

    this.updateViewerFavState();

    const cachedKey = `cch_sim_cached_${sim.id}`;
    const cachedHtml = localStorage.getItem(cachedKey);

    if (cachedHtml) {
      iframe.srcdoc = cachedHtml;
    } else if (sim.downloadUrl) {
      iframe.srcdoc = '<!DOCTYPE html><html><body style="background:#07111a;color:#38bdf8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center;padding:20px;"><div><div style="font-size:28px;margin-bottom:12px;">⚡</div><h3 style="margin:0 0 8px 0;color:#f1f5f9;">Loading Live Simulator...</h3><p style="font-size:13px;color:#94a3b8;margin:0;">Fetching clinical algorithms & telemetry from cloud...</p></div></body></html>';
      fetch(sim.downloadUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(html => {
          try { localStorage.setItem(cachedKey, html); } catch(e) {}
          iframe.srcdoc = html;
        })
        .catch(err => {
          console.warn('Could not fetch remote raw HTML, attempting local file fallback:', err);
          iframe.removeAttribute('srcdoc');
          iframe.src = `${sim.file}?embedded=1&v=${Date.now()}`;
        });
    } else {
      iframe.removeAttribute('srcdoc');
      iframe.src = `${sim.file}?embedded=1&v=${Date.now()}`;
    }

    viewer.classList.add('active');
    document.body.classList.add('in-simulator-mode');
  }

  closeSimulatorViewer() {
    const viewer = document.getElementById('simulatorViewer');
    const iframe = document.getElementById('simulatorIframe');

    if (viewer) viewer.classList.remove('active');
    if (iframe) {
      iframe.removeAttribute('srcdoc');
      iframe.src = 'about:blank';
    }

    document.body.classList.remove('in-simulator-mode');
    this.activeSimulator = null;
  }

  updateViewerFavState() {
    const viewerFavBtn = document.getElementById('viewerFavBtn');
    if (!viewerFavBtn || !this.activeSimulator) return;

    const isFav = this.favorites.includes(this.activeSimulator.id);
    viewerFavBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
    `;
  }

  renderFavoritesView() {
    const favContainer = document.getElementById('favoritesListContainer');
    const recentsContainer = document.getElementById('recentsListContainer');
    const isPro = subscriptionManager.isPro();

    if (favContainer) {
      const favSims = this.simulators.filter(s => this.favorites.includes(s.id));
      if (favSims.length === 0) {
        favContainer.innerHTML = `
          <div class="empty-state-mini">
            <p>No bookmarked simulators yet. Tap the heart icon on any simulator card to save it here for fast bedside access.</p>
          </div>
        `;
      } else {
        favContainer.innerHTML = `
          <div class="sim-cards-grid">
            ${favSims.map(sim => this.createSimulatorCardHtml(sim, isPro)).join('')}
          </div>
        `;
        this.bindSimulatorCardActions(favContainer);
      }
    }

    if (recentsContainer) {
      const recentSims = this.recents
        .map(id => this.simulators.find(s => s.id === id))
        .filter(Boolean);

      if (recentSims.length === 0) {
        recentsContainer.innerHTML = `
          <div class="empty-state-mini">
            <p>Recently launched simulators will appear here.</p>
          </div>
        `;
      } else {
        recentsContainer.innerHTML = `
          <div class="sim-cards-grid">
            ${recentSims.map(sim => this.createSimulatorCardHtml(sim, isPro)).join('')}
          </div>
        `;
        this.bindSimulatorCardActions(recentsContainer);
      }
    }
  }

  renderProFeaturesList() {
    const container = document.getElementById('proFeaturesContainer');
    if (!container) return;

    container.innerHTML = PRO_FEATURES.map(feat => `
      <div class="pro-feature-item">
        <div class="pro-feature-icon-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="pro-feature-text">
          <h5>${feat.title}</h5>
          <p>${feat.desc}</p>
        </div>
      </div>
    `).join('');
  }

  populateQuickJumpSelect() {
    const select = document.getElementById('hudQuickJump');
    if (!select) return;

    select.innerHTML = `<option value="">⚡ Quick Launch Simulator...</option>` +
      this.simulators.map(s => `
        <option value="${s.id}">[${s.tier.toUpperCase()}] ${s.title}</option>
      `).join('');
  }

  switchTab(tabId) {
    this.activeTab = tabId;

    // Update tab contents
    document.querySelectorAll('.tab-content').forEach(view => {
      if (view.getAttribute('data-tab-content') === tabId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Update bottom nav items
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      if (btn.getAttribute('data-tab-target') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Scroll to top of active view
    const activeView = document.querySelector(`.tab-content[data-tab-content="${tabId}"]`);
    if (activeView) activeView.scrollTop = 0;
  }

  updateSubscriptionUI() {
    const isPro = subscriptionManager.isPro();
    const proPills = document.querySelectorAll('.sub-tier-badge');
    const hudTierBtn = document.getElementById('hudTierToggleBtn');
    const proBanner = document.getElementById('hubProBanner');
    const proTabStatus = document.getElementById('proTabStatusText');
    const paywallCtaBtn = document.getElementById('paywallCtaBtn');

    proPills.forEach(pill => {
      if (isPro) {
        pill.innerHTML = `<span>💎 PRO ACTIVE</span>`;
        pill.className = 'sub-tier-badge badge-pro-active';
      } else {
        pill.innerHTML = `<span>UPGRADE TO PRO</span>`;
        pill.className = 'sub-tier-badge badge-free-tier';
      }
    });

    if (hudTierBtn) {
      hudTierBtn.innerHTML = isPro 
        ? `<span class="indicator-dot green"></span> Mode: PRO (Unlocked)`
        : `<span class="indicator-dot amber"></span> Mode: FREE (Paywalled)`;
    }

    if (proBanner) {
      if (isPro) {
        proBanner.classList.add('hidden');
      } else {
        proBanner.classList.remove('hidden');
      }
    }

    if (proTabStatus) {
      proTabStatus.textContent = isPro ? 'Active Subscription' : 'Free Demo Account';
    }

    if (paywallCtaBtn) {
      paywallCtaBtn.textContent = isPro 
        ? 'Already Subscribed (Re-verify)'
        : 'Start 7-Day Free Trial (₹2,999/yr)';
    }

    this.renderSimulatorsHub();
    this.renderFavoritesView();
  }

  updateFavoriteButtons() {
    document.querySelectorAll('.fav-btn').forEach(btn => {
      const simId = btn.getAttribute('data-fav-id');
      const isFav = this.favorites.includes(simId);
      btn.classList.toggle('favorited', isFav);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isFav ? '#ef4444' : 'none');
        svg.setAttribute('stroke', isFav ? '#ef4444' : 'currentColor');
      }
    });
  }

  showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  bindAppEvents() {
    // Header Auth Button
    const headerAuthBtn = document.getElementById('headerAuthBtn');
    if (headerAuthBtn) {
      headerAuthBtn.addEventListener('click', () => {
        this.showAuthModal();
      });
    }

    // Auth Modal Close
    const closeAuthBtn = document.getElementById('closeAuthBtn');
    if (closeAuthBtn) {
      closeAuthBtn.addEventListener('click', () => {
        this.hideAuthModal();
      });
    }

    // Email Login in Auth Modal
    const authLoginForm = document.getElementById('authLoginForm');
    if (authLoginForm) {
      authLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.getElementById('authEmailInput')?.value || '').trim();
        const pass = (document.getElementById('authPassInput')?.value || '').trim();
        if (!email || !pass) {
          this.showToast('Please enter both email and password', 'error');
          return;
        }
        try {
          const res = await firebaseService.signInWithEmail(email, pass);
          this.hideAuthModal();
          this.showToast(`✅ Welcome, ${res.user?.name || 'Doctor'}!`, 'success');
        } catch (err) {
          this.showToast(err.message || 'Login failed', 'error');
        }
      });
    }

    // Google Sign-In in Auth Modal
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', async () => {
        googleSignInBtn.disabled = true;
        googleSignInBtn.textContent = 'Connecting Google Auth...';
        try {
          const res = await firebaseService.signInWithGoogle();
          if (res && res.user) {
            this.hideAuthModal();
            this.showToast(`✅ Signed in with Google as ${res.user.name || 'Doctor'}`, 'success');
          }
        } catch (err) {
          this.showToast(err.message || 'Google Sign-In failed', 'error');
        } finally {
          googleSignInBtn.disabled = false;
          googleSignInBtn.textContent = 'Continue with Google Account';
        }
      });
    }

    // Sign Out
    const authSignOutBtn = document.getElementById('authSignOutBtn');
    if (authSignOutBtn) {
      authSignOutBtn.addEventListener('click', async () => {
        await firebaseService.signOut();
        subscriptionManager.setTier('free');
        this.hideAuthModal();
        this.showToast('Signed out successfully', 'info');
      });
    }

    // Quick Test Switch User in Auth Modal
    document.querySelectorAll('[data-switch-user]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userType = e.currentTarget.getAttribute('data-switch-user');
        if (userType === 'admin') {
          await firebaseService.signInWithEmail('admin@criticalcare.med', 'admin');
        } else if (userType === 'vip') {
          const u = await firebaseService.signInWithEmail('vip.doctor@hospital.org', 'pass');
          await firebaseService.setUserVIP(u.uid, true);
        } else {
          await firebaseService.signInWithEmail('trainee@medical.edu', 'pass');
          subscriptionManager.setTier('free');
        }
        this.hideAuthModal();
        this.showToast(`Switched account to: ${userType.toUpperCase()}`, 'info');
      });
    });

    // Navigation Tabs
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(tab);
      });
    });

    // Search input
    const searchInput = document.getElementById('simSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderSimulatorsHub();
      });
    }

    // Disclaimer accept button
    const acceptDisclaimerBtn = document.getElementById('acceptDisclaimerBtn');
    if (acceptDisclaimerBtn) {
      acceptDisclaimerBtn.addEventListener('click', () => {
        disclaimerManager.acceptDisclaimer();
        this.hideDisclaimerModal();
        this.showToast('✅ Medical Disclaimer Confirmed', 'success');
      });
    }

    // Paywall close button
    const closePaywallBtn = document.getElementById('closePaywallBtn');
    if (closePaywallBtn) {
      closePaywallBtn.addEventListener('click', () => {
        this.hidePaywallModal();
      });
    }

    // Paywall Plan Selection
    document.querySelectorAll('[data-plan-option]').forEach(card => {
      card.addEventListener('click', (e) => {
        const planKey = e.currentTarget.getAttribute('data-plan-option');
        subscriptionManager.setSelectedPlan(planKey);

        document.querySelectorAll('[data-plan-option]').forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');

        const ctaBtn = document.getElementById('paywallCtaBtn');
        if (ctaBtn) {
          ctaBtn.textContent = planKey === 'annual' 
            ? 'Start 7-Day Free Trial (₹2,999/yr)'
            : 'Subscribe Monthly (₹399/mo)';
        }
      });
    });

    // Simulate Purchase CTA Button
    const paywallCtaBtn = document.getElementById('paywallCtaBtn');
    if (paywallCtaBtn) {
      paywallCtaBtn.addEventListener('click', async () => {
        paywallCtaBtn.disabled = true;
        paywallCtaBtn.innerHTML = `<span class="spinner"></span> Processing StoreKit Purchase...`;

        await subscriptionManager.simulatePurchase();

        paywallCtaBtn.disabled = false;
        paywallCtaBtn.innerHTML = `<span>Start 7-Day Free Trial</span>`;
        this.hidePaywallModal();
        this.showToast(`🎉 Pro Subscription Activated! All ${this.simulators.length} simulators unlocked.`, 'success');

        // If a locked simulator was waiting to launch, launch it now!
        if (this.activeSimulator) {
          this.launchSimulator(this.activeSimulator.id);
        }
      });
    }

    // Restore Purchases Button
    const restoreBtn = document.getElementById('restorePurchasesBtn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', async () => {
        restoreBtn.disabled = true;
        restoreBtn.textContent = 'Contacting App Store...';
        const res = await subscriptionManager.restorePurchases();
        restoreBtn.disabled = false;
        restoreBtn.textContent = 'Restore Purchases';
        this.showToast(res.message, 'success');
      });
    }

    // Viewer Back Button
    const viewerBackBtn = document.getElementById('viewerBackBtn');
    if (viewerBackBtn) {
      viewerBackBtn.addEventListener('click', () => {
        this.closeSimulatorViewer();
      });
    }

    // Viewer Favorite Button
    const viewerFavBtn = document.getElementById('viewerFavBtn');
    if (viewerFavBtn) {
      viewerFavBtn.addEventListener('click', () => {
        if (this.activeSimulator) {
          this.toggleFavorite(this.activeSimulator.id);
          this.updateViewerFavState();
        }
      });
    }

    // Viewer Reload/Restart Button
    const viewerReloadBtn = document.getElementById('viewerReloadBtn');
    if (viewerReloadBtn) {
      viewerReloadBtn.addEventListener('click', () => {
        const iframe = document.getElementById('simulatorIframe');
        if (iframe && this.activeSimulator) {
          iframe.src = `${this.activeSimulator.file}?reload=${Date.now()}`;
          this.showToast('🔄 Simulator session restarted', 'info');
        }
      });
    }

    // Pro Banner in Hub click
    const hubProBannerBtn = document.getElementById('hubProBannerBtn');
    if (hubProBannerBtn) {
      hubProBannerBtn.addEventListener('click', () => {
        this.showPaywallModal();
      });
    }

    // Pro Tab Purchase Button
    const proTabUnlockBtn = document.getElementById('proTabUnlockBtn');
    if (proTabUnlockBtn) {
      proTabUnlockBtn.addEventListener('click', () => {
        this.showPaywallModal();
      });
    }

    // Pro Tab Downgrade/Reset Button
    const proTabResetBtn = document.getElementById('proTabResetBtn');
    if (proTabResetBtn) {
      proTabResetBtn.addEventListener('click', () => {
        subscriptionManager.setTier('free');
        this.showToast('🔒 Account switched to Free Tier', 'info');
      });
    }

    // Reopen disclaimer
    const reopenDisclaimerBtn = document.getElementById('reopenDisclaimerBtn');
    if (reopenDisclaimerBtn) {
      reopenDisclaimerBtn.addEventListener('click', () => {
        this.showDisclaimerModal();
      });
    }

    // Global Subscription State listener
    window.addEventListener(SUBSCRIPTION_EVENT, () => {
      this.updateSubscriptionUI();
    });

    // Global Disclaimer State listener
    window.addEventListener(DISCLAIMER_EVENT, (e) => {
      if (!e.detail.isAccepted) {
        this.showDisclaimerModal();
      }
    });

    // Offline / Online sync
    window.addEventListener('online', () => this.showToast('📶 Online — Cloud sync ready', 'info'));
    window.addEventListener('offline', () => this.showToast('📡 Offline Mode Active (Full local simulator support)', 'info'));
  }

  showToast(message, type = 'success') {
    let container = document.getElementById('mobileToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mobileToastContainer';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        max-width: 90%;
        width: max-content;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: ${type === 'error' ? '#ef4444' : (type === 'info' ? '#0284c7' : '#10b981')};
      color: white;
      padding: 10px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      opacity: 0;
      transform: translateY(12px);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      text-align: center;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  initPushNotifications() {
    if (!firebaseService || !firebaseService.subscribeToNotifications) return;

    const shownNotifsKey = 'cch_shown_notifications';
    let shownIds = [];
    try {
      shownIds = JSON.parse(sessionStorage.getItem(shownNotifsKey) || '[]');
    } catch (e) {}

    firebaseService.subscribeToNotifications((notifications) => {
      if (!notifications || !Array.isArray(notifications) || notifications.length === 0) return;

      // Find newest unseen notification
      const unseen = notifications.filter(n => n && n.id && !shownIds.includes(n.id));
      if (unseen.length > 0) {
        const newest = unseen[0];
        shownIds.push(newest.id);
        try {
          sessionStorage.setItem(shownNotifsKey, JSON.stringify(shownIds.slice(-25)));
        } catch (e) {}

        this.displayPushNotification(newest);
      }
    });
  }

  displayPushNotification(notif) {
    let banner = document.getElementById('inAppPushNotificationBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'inAppPushNotificationBanner';
      banner.style.cssText = `
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%) translateY(-130%);
        width: 92%;
        max-width: 460px;
        background: linear-gradient(135deg, #09131f 0%, #17273d 100%);
        border: 1.5px solid #38bdf8;
        border-radius: 14px;
        box-shadow: 0 16px 36px rgba(0,0,0,0.65), 0 0 24px rgba(56, 189, 248, 0.25);
        z-index: 999999;
        padding: 14px 16px;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        opacity: 0;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      document.body.appendChild(banner);
    }

    banner.innerHTML = `
      <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">
        📢
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${notif.title || 'Clinical Alert'}</h4>
          <span style="font-size: 10px; color: #94a3b8; margin-left: 8px;">Just now</span>
        </div>
        <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.45;">${notif.message || ''}</p>
      </div>
      <button type="button" id="closeNotifBannerBtn" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1; margin-top: -2px;">&times;</button>
    `;

    // Animate in
    requestAnimationFrame(() => {
      banner.style.transform = 'translateX(-50%) translateY(0)';
      banner.style.opacity = '1';
    });

    const closeBtn = banner.querySelector('#closeNotifBannerBtn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        banner.style.transform = 'translateX(-50%) translateY(-130%)';
        banner.style.opacity = '0';
      };
    }

    setTimeout(() => {
      if (banner && banner.parentElement) {
        banner.style.transform = 'translateX(-50%) translateY(-130%)';
        banner.style.opacity = '0';
      }
    }, 9000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.criticalCareApp = new App();
  window.criticalCareApp.init();
});
