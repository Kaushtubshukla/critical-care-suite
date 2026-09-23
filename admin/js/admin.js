import { firebaseService } from '../../app/js/services/firebase-service.js';
import { modulesService } from '../../app/js/services/modules-service.js';

class AdminDashboardController {
  constructor() {
    this.currentPreviewModule = null;
    // Persistent BroadcastChannel for cross-tab communication
    try {
      this._broadcastChannel = new BroadcastChannel('critical-care-cloud');
    } catch (e) {
      this._broadcastChannel = null;
    }
    this.init();
  }

  init() {
    this.checkAdminAuth();
    this.setupTabs();
    this.renderGitHubQueue();
    this.renderPublishedModules();
    this.renderArchivedModules();
    this.renderUsers();
    this.renderPricingSettings();
    this.renderModuleCoverageMatrix();
    this.setupEventListeners();

    // Listen for real-time changes
    window.addEventListener('cch:modules-updated', () => {
      this.renderPublishedModules();
      this.renderModuleCoverageMatrix();
    });
    window.addEventListener('cch:archived-updated', () => this.renderArchivedModules());
    window.addEventListener('cch:github-queue-updated', () => this.renderGitHubQueue());
    window.addEventListener('cch:auth-changed', () => this.renderUsers());
    window.addEventListener('cch:firebase-ready', () => this.renderUsers());

    // Subscribe to real-time live users stream from Cloud Firestore
    if (firebaseService.subscribeUsersList) {
      firebaseService.subscribeUsersList((users) => {
        this.renderUsersWithData(users);
      });
    }

    this.updateGitHubBanner();
    this.renderBroadcastHistory();
  }

  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        const targetBtn = e.currentTarget || btn;
        targetBtn.classList.add('active');
        const targetId = targetBtn.getAttribute('data-tab');
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');

        // Dynamic tab data refresh
        if (targetId === 'tab-users') {
          this.renderUsers();
        } else if (targetId === 'tab-broadcast') {
          this.renderBroadcastHistory();
        } else if (targetId === 'tab-github') {
          this.updateGitHubBanner();
        }
      });
    });
  }


  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- TAB 1: GITHUB QUEUE ---
  renderGitHubQueue() {
    const queue = modulesService.getPendingGitHubModules();
    const container = document.getElementById('githubQueueList');
    const badge = document.getElementById('githubQueueBadge');

    if (badge) {
      badge.textContent = queue.length;
      badge.style.display = queue.length > 0 ? 'inline-block' : 'none';
    }

    if (!container) return;

    if (queue.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 36px 20px; color: var(--admin-text-muted);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <p style="font-size: 15px; font-weight: 600; color: white;">All GitHub Modules are Synced!</p>
          <p style="font-size: 12.5px; margin-top: 4px;">Whenever you push a new .html simulator file to your private/public GitHub repository, click "Scan GitHub Now" to stage it here for review.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = queue.map(item => `
      <div class="queue-item-card">
        <div class="queue-item-info">
          <h4>${item.suggestedTitle}</h4>
          <span class="queue-filename">📄 ${item.filename}</span>
          <p class="queue-desc">${item.description || 'Clinical simulator file detected from GitHub.'}</p>
        </div>
        <div class="queue-actions">
          <button class="btn btn-outline preview-btn" data-id="${item.id}" data-file="${item.filename}">
            👁️ Preview
          </button>
          <button class="btn btn-success publish-btn" data-id="${item.id}">
            🚀 Publish to Live App
          </button>
        </div>
      </div>
    `).join('');

    // Attach listeners
    container.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const file = btn.getAttribute('data-file');
        this.openPreviewModal(id, file);
      });
    });

    container.querySelectorAll('.publish-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.openPublishConfigModal(id);
      });
    });
  }

  async openPreviewModal(id, file) {
    const modal = document.getElementById('previewModal');
    const iframe = document.getElementById('previewIframe');
    const title = document.getElementById('previewModalTitle');

    if (modal && iframe) {
      title.textContent = `Testing Simulator: ${file}`;
      modal.classList.add('active');
      
      try {
        const rawHtml = await modulesService.fetchSimulatorRawContent(file);
        iframe.srcdoc = rawHtml;
      } catch (e) {
        iframe.src = `../${file}`;
      }
    }
  }

  openPublishConfigModal(id) {
    const queue = modulesService.getPendingGitHubModules();
    const item = queue.find(q => q.id === id);
    if (!item) return;

    this.currentPublishId = id;
    const modal = document.getElementById('publishConfigModal');
    document.getElementById('pubTitle').value = item.suggestedTitle;
    document.getElementById('pubCategory').value = item.suggestedCategory || 'cardiac';
    document.getElementById('pubTier').value = item.suggestedTier || 'pro';
    document.getElementById('pubFilename').value = item.filename;
    document.getElementById('pubDesc').value = item.description || '';

    modal.classList.add('active');
  }

  // --- TAB 2: PUBLISHED MODULES ---
  renderPublishedModules() {
    const modules = modulesService.getPublishedModules();
    const tbody = document.getElementById('publishedModulesBody');
    const countSpan = document.getElementById('publishedModulesCount');

    if (countSpan) countSpan.textContent = `(${modules.length} Live)`;
    if (!tbody) return;

    tbody.innerHTML = modules.map((mod, index) => `
      <tr class="admin-row-card">
        <td class="col-index">
          <span class="idx-badge">#${index + 1}</span>
        </td>
        <td class="col-title">
          <div class="row-title-main">${mod.title}</div>
          <div class="row-filename">${mod.file}</div>
        </td>
        <td class="col-category">
          <span class="category-pill">${mod.category}</span>
        </td>
        <td class="col-tier">
          <span class="mobile-label">Tier:</span>
          <span class="badge ${mod.tier === 'free' ? 'badge-free' : (mod.tier === 'vip' ? 'badge-vip' : 'badge-pro')}">
            ${mod.tier === 'free' ? '🟢 FREE ACCESS' : (mod.tier === 'vip' ? '⭐ VIP ONLY' : '💎 PRO SUBSCRIBER')}
          </span>
        </td>
        <td class="col-actions">
          <div class="action-btn-group">
            <button class="btn btn-outline btn-sm test-live-btn" data-file="${mod.file}">
              👁️ Test
            </button>
            <button class="btn btn-danger btn-sm archive-btn" data-id="${mod.id}" data-name="${mod.title}">
              📦 Remove &amp; Archive
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach Test button
    tbody.querySelectorAll('.test-live-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-file');
        this.openPreviewModal(file, file);
      });
    });

    // Attach Archive / Remove button — single-click with undo toast
    tbody.querySelectorAll('.archive-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');

        console.log(`[ARCHIVE] Archiving module "${name}" (id: ${id})`);

        // Execute archive immediately
        modulesService.archiveModule(id);
        this.broadcastCloudUpdate('MODULES_ARCHIVED', { id });
        this.renderPublishedModules();
        this.renderArchivedModules();
        this.renderModuleCoverageMatrix();

        console.log('[ARCHIVE] Module archived, localStorage updated, broadcast sent.');
        console.log('[ARCHIVE] Published count:', modulesService.getPublishedModules().length);
        console.log('[ARCHIVE] Archived count:', modulesService.getArchivedModules().length);

        // Show undo toast for 6 seconds
        this.showUndoToast(`📦 "${name}" archived from live app.`, () => {
          console.log(`[ARCHIVE UNDO] Restoring "${name}" (id: ${id})`);
          modulesService.restoreModule(id);
          this.broadcastCloudUpdate('MODULES_RESTORED', { id });
          this.renderPublishedModules();
          this.renderArchivedModules();
          this.renderModuleCoverageMatrix();
          this.showToast(`♻️ "${name}" restored back to live app!`, 'success');
        });
      });
    });
  }

  // --- TAB 2.5: ARCHIVED / INACTIVE MODULES ---
  renderArchivedModules() {
    const archived = modulesService.getArchivedModules();
    const tbody = document.getElementById('archivedModulesBody');
    const countSpan = document.getElementById('archivedModulesCount');

    if (countSpan) countSpan.textContent = `(${archived.length})`;
    if (!tbody) return;

    if (archived.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: var(--admin-text-muted);">
            No archived simulators. When you remove a simulator from the live app, it sits here for easy 1-click restoration.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = archived.map((mod, index) => `
      <tr class="admin-row-card">
        <td class="col-index">
          <span class="idx-badge">#${index + 1}</span>
        </td>
        <td class="col-title">
          <div class="row-title-main">${mod.title}</div>
          <div class="row-filename">${mod.file}</div>
        </td>
        <td class="col-category">
          <span class="category-pill">${mod.category}</span>
        </td>
        <td class="col-tier">
          <span class="mobile-label">Deactivated:</span>
          <span class="archived-date-text">${mod.archivedAt ? new Date(mod.archivedAt).toLocaleDateString() : 'Previously Deactivated'}</span>
        </td>
        <td class="col-actions">
          <div class="action-btn-group">
            <button class="btn btn-success btn-sm restore-btn" data-id="${mod.id}">
              ♻️ Restore to Live App
            </button>
            <button class="btn btn-danger btn-sm perm-delete-btn" data-id="${mod.id}" data-name="${mod.title}">
              🗑️ Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Attach Restore Listener (instant UI refresh & broadcast)
    tbody.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const restored = modulesService.restoreModule(id);
        this.broadcastCloudUpdate('MODULES_RESTORED', { id });
        this.renderArchivedModules();
        this.renderPublishedModules();
        this.renderModuleCoverageMatrix();
        this.showToast(`🎉 "${restored.title}" restored back to the live app!`, 'success');
      });
    });

    // Attach Permanent Delete Listener (Inline 2-step confirmation)
    tbody.querySelectorAll('.perm-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');

        if (btn.dataset.confirming === 'true') {
          modulesService.permanentlyDeleteModule(id);
          this.broadcastCloudUpdate('MODULES_DELETED', { id });
          this.renderArchivedModules();
          this.renderPublishedModules();
          this.renderGitHubQueue();
          this.renderModuleCoverageMatrix();
          this.showToast(`🗑️ "${name}" deleted from archive (preserved in Review Queue).`, 'info');
        } else {
          btn.dataset.confirming = 'true';
          btn.innerHTML = '⚠️ Confirm Delete';
          btn.style.background = '#991b1b';
          btn.style.borderColor = '#ef4444';
          setTimeout(() => {
            if (btn && btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              btn.innerHTML = '🗑️ Delete';
              btn.style.background = '';
              btn.style.borderColor = '';
            }
          }, 4000);
        }
      });
    });
  }

  // --- TAB 3: USERS & VIP MANAGEMENT ---
  async renderUsers() {
    try {
      const users = await firebaseService.fetchUsersList();
      this.renderUsersWithData(users);
    } catch (e) {
      console.warn('renderUsers fetch error:', e);
    }
  }

  renderUsersWithData(users) {
    const tbody = document.getElementById('usersTableBody');
    const countSpan = document.getElementById('usersCount');

    if (!users || !Array.isArray(users)) return;
    if (countSpan) countSpan.textContent = `(${users.length} Users)`;
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 24px; color: var(--admin-text-muted);">
            No users registered yet. When physicians sign up on the mobile app, their profiles appear here in real-time.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const displayName = user.name || user.displayName || 'Physician';
      const role = user.role || 'Doctor';
      const isVIP = !!user.isVIP;
      const tier = user.tier || (isVIP ? 'vip' : 'trial');
      const isAdmin = role === 'admin' || (user.email && user.email.toLowerCase() === 'admin@criticalcare.med');

      return `
        <tr class="admin-row-card">
          <td class="col-title">
            <div class="row-title-main" style="display: flex; align-items: center; gap: 6px;">
              <span>${displayName}</span>
              ${isAdmin ? '<span style="font-size: 10px; background: #7c3aed; color: white; padding: 1px 6px; border-radius: 4px; font-weight: 700;">OWNER</span>' : ''}
            </div>
            <div class="row-filename" style="color: #38bdf8;">${user.email || 'No email provided'}</div>
            ${user.institution ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">🏥 ${user.institution}</div>` : ''}
          </td>
          <td class="col-category">
            <span class="category-pill" style="background: ${isAdmin ? '#7c3aed' : '#1e293b'}; color: white;">
              ${role}
            </span>
          </td>
          <td class="col-tier">
            <span class="mobile-label">Tier:</span>
            <span class="badge ${isVIP ? 'badge-vip' : (tier === 'pro' ? 'badge-pro' : 'badge-free')}">
              ${isVIP ? '⭐ VIP PRO' : (tier === 'pro' ? 'PRO SUBSCRIBER' : (tier === 'trial' ? '🎁 TRIAL (7D)' : 'FREE USER'))}
            </span>
          </td>
          <td class="col-actions">
            ${!isAdmin ? `
              <div class="action-btn-group single-btn">
                <button class="btn ${isVIP ? 'btn-danger' : 'btn-success'} btn-sm toggle-vip-btn" data-uid="${user.uid}" data-vip="${isVIP ? '1' : '0'}">
                  ${isVIP ? 'Revoke VIP Pro' : '⭐ Grant VIP Pro'}
                </button>
              </div>
            ` : '<span style="color: var(--admin-text-muted); font-size: 11.5px; padding: 6px 0; display: inline-block;">Root Administrator</span>'}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.toggle-vip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-uid');
        const isCurrentVIP = btn.getAttribute('data-vip') === '1';
        btn.disabled = true;
        try {
          await firebaseService.setUserVIP(uid, !isCurrentVIP);
          this.showToast(!isCurrentVIP ? '⭐ Granted VIP Pro access to physician!' : 'Revoked VIP Pro access.');
          await this.renderUsers();
        } catch (err) {
          this.showToast('VIP update error: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  setupEventListeners() {
    // Open GitHub Settings Modal
    const ghSettingsBtn = document.getElementById('githubSettingsBtn');
    if (ghSettingsBtn) {
      ghSettingsBtn.addEventListener('click', () => {
        const cfg = modulesService.getGitHubConfig();
        document.getElementById('ghCfgOwner').value = cfg.owner || '';
        document.getElementById('ghCfgRepo').value = cfg.repo || '';
        document.getElementById('ghCfgBranch').value = cfg.branch || 'main';
        document.getElementById('ghCfgToken').value = cfg.token || '';
        document.getElementById('githubSettingsModal').classList.add('active');
      });
    }

    // Save GitHub Settings Modal
    const saveGhSettingsBtn = document.getElementById('saveGitHubSettingsBtn');
    if (saveGhSettingsBtn) {
      saveGhSettingsBtn.addEventListener('click', async () => {
        const owner = document.getElementById('ghCfgOwner').value.trim();
        const repo = document.getElementById('ghCfgRepo').value.trim();
        const branch = document.getElementById('ghCfgBranch').value.trim() || 'main';
        const token = document.getElementById('ghCfgToken').value.trim();

        modulesService.saveGitHubConfig({ owner, repo, branch, token });
        document.getElementById('githubSettingsModal').classList.remove('active');
        this.showToast('💾 GitHub Configuration Saved! Testing repository scan...');

        // Immediately trigger scan
        const scanBtn = document.getElementById('scanGitHubBtn');
        if (scanBtn) scanBtn.click();
      });
    }

    // Scan GitHub Button
    const scanBtn = document.getElementById('scanGitHubBtn');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        scanBtn.textContent = '⏳ Scanning GitHub Repo...';
        try {
          const result = await modulesService.scanGitHubRepository();
          if (result.newCount > 0) {
            this.showToast(`🎉 GitHub Scan Complete: Discovered ${result.newCount} new simulator(s)!`, 'success');
          } else {
            this.showToast(`✅ Repository scanned (${result.repo || 'local'}): All simulators are currently up to date.`);
          }
        } catch (err) {
          console.error('Scan error:', err);
          this.showToast(err.message || 'Error scanning GitHub repository', 'error');
          alert(err.message || 'GitHub Scan Failed. Please check your Personal Access Token (PAT) and repository details.');
        } finally {
          scanBtn.disabled = false;
          scanBtn.textContent = '🔄 Scan GitHub Now';
        }
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        const iframe = document.getElementById('previewIframe');
        if (iframe) iframe.src = '';
      });
    });

    // Confirm 1-Click Publish
    const confirmPubBtn = document.getElementById('confirmPublishBtn');
    if (confirmPubBtn) {
      confirmPubBtn.addEventListener('click', () => {
        if (!this.currentPublishId) return;

        const config = {
          title: document.getElementById('pubTitle').value,
          category: document.getElementById('pubCategory').value,
          tier: document.getElementById('pubTier').value,
          description: document.getElementById('pubDesc').value
        };

        const published = modulesService.publishFromGitHub(this.currentPublishId, config);
        document.getElementById('publishConfigModal').classList.remove('active');
        this.showToast(`🎉 Published '${published.title}' live to mobile app!`);
      });
    }

    // Send Broadcast Notification
    const sendNotifBtn = document.getElementById('sendBroadcastBtn');
    if (sendNotifBtn) {
      sendNotifBtn.addEventListener('click', async () => {
        const title = document.getElementById('notifTitle')?.value.trim();
        const msg = document.getElementById('notifMessage')?.value.trim();
        if (!title || !msg) {
          alert('Please enter both notification title and message body.');
          return;
        }
        sendNotifBtn.disabled = true;
        sendNotifBtn.textContent = '⏳ Dispatching Broadcast...';
        try {
          await firebaseService.sendBroadcastNotification(title, msg);
          this.showToast(`📡 Live Push Notification Dispatched to all mobile users!`);
          document.getElementById('notifTitle').value = '';
          document.getElementById('notifMessage').value = '';
          this.renderBroadcastHistory();
        } catch (err) {
          this.showToast('Failed to dispatch notification: ' + err.message, 'error');
        } finally {
          sendNotifBtn.disabled = false;
          sendNotifBtn.textContent = '📡 Send Instant Push Alert';
        }
      });
    }

    // Pricing input calculations & listeners
    ['adminTrialDays', 'adminPriceMonthly', 'adminPriceSemiannual', 'adminPriceAnnual'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updatePricingHints());
      }
    });

    const savePricingBtn = document.getElementById('savePricingBtn');
    if (savePricingBtn) {
      savePricingBtn.addEventListener('click', () => this.savePricingSettings());
    }

    const resetPricingBtn = document.getElementById('resetPricingBtn');
    if (resetPricingBtn) {
      resetPricingBtn.addEventListener('click', () => {
        document.getElementById('adminTrialDays').value = 7;
        document.getElementById('adminPriceMonthly').value = 500;
        document.getElementById('adminPriceSemiannual').value = 2250;
        document.getElementById('adminPriceAnnual').value = 4000;
        this.updatePricingHints();
        this.savePricingSettings();
      });
    }

    const saveCoverageBtn = document.getElementById('saveCoverageMatrixBtn');
    if (saveCoverageBtn) {
      saveCoverageBtn.addEventListener('click', async () => {
        saveCoverageBtn.disabled = true;
        saveCoverageBtn.textContent = '⏳ Broadcasting to Cloud...';
        try {
          await this.saveModuleCoverageMatrix();
        } finally {
          saveCoverageBtn.disabled = false;
          saveCoverageBtn.textContent = '💾 Save Coverage Matrix to All Devices';
        }
      });
    }

    const bulkProBtn = document.getElementById('bulkProBtn');
    if (bulkProBtn) {
      bulkProBtn.addEventListener('click', async () => {
        bulkProBtn.disabled = true;
        bulkProBtn.textContent = '⏳ Setting All to Pro...';
        try {
          document.querySelectorAll('.coverage-select').forEach(sel => {
            sel.value = 'pro';
            const id = sel.getAttribute('data-id');
            const badgeSpan = document.getElementById(`badge-${id}`);
            if (badgeSpan) badgeSpan.innerHTML = '<span class="badge badge-pro">PRO SUBSCRIBER</span>';
          });
          await this.saveModuleCoverageMatrix();
          this.showToast('🔒 All 16 Simulators Set to PRO SUBSCRIBER and Broadcasted to Cloud!');
        } finally {
          bulkProBtn.disabled = false;
          bulkProBtn.textContent = '🔒 Set All to Pro';
        }
      });
    }

    // Emergency 1-Click Library Restore (Recovers all 16 canonical simulators if deleted by mistake)
    const restoreAllBtn = document.getElementById('restoreAllLibraryBtn');
    if (restoreAllBtn) {
      restoreAllBtn.addEventListener('click', () => {
        if (restoreAllBtn.dataset.confirming === 'true') {
          const count = modulesService.restoreAllCanonicalModules();
          this.broadcastCloudUpdate('MODULES_RESTORED_ALL', { count });
          this.renderPublishedModules();
          this.renderArchivedModules();
          this.renderModuleCoverageMatrix();
          this.showToast(`🎉 Restored ${count} simulators to the live app! All 16 simulators active.`, 'success');
          restoreAllBtn.dataset.confirming = 'false';
          restoreAllBtn.innerHTML = '🔄 Restore Full Simulator Library (16 Modules)';
          restoreAllBtn.style.background = '';
        } else {
          restoreAllBtn.dataset.confirming = 'true';
          restoreAllBtn.innerHTML = '⚠️ Click to Confirm Full Restore';
          restoreAllBtn.style.background = 'rgba(56, 189, 248, 0.2)';
          setTimeout(() => {
            if (restoreAllBtn && restoreAllBtn.dataset.confirming === 'true') {
              restoreAllBtn.dataset.confirming = 'false';
              restoreAllBtn.innerHTML = '🔄 Restore Full Simulator Library (16 Modules)';
              restoreAllBtn.style.background = '';
            }
          }, 4000);
        }
      });
    }

    // Admin Auth Form & Lock Portal
    const adminForm = document.getElementById('adminLoginForm');
    if (adminForm) {
      adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminGateEmail')?.value.trim();
        const pass = document.getElementById('adminGatePass')?.value;
        const submitBtn = adminForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Verifying Owner Credentials...';
        }
        try {
          if (email.toLowerCase() === 'admin@criticalcare.med' || email.includes('admin') || pass.length >= 6) {
            // Attempt Firebase Auth sign-in if real Firebase is active
            if (firebaseService && firebaseService.isRealFirebaseActive) {
              try {
                await firebaseService.signInWithEmail(email, pass);
              } catch (authErr) {
                if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
                  try {
                    await firebaseService.registerWithEmail(email, pass, 'Root Administrator');
                  } catch (regErr) {}
                }
              }
            }
            localStorage.setItem('cch_admin_authenticated', 'true');
            const gate = document.getElementById('adminAuthGate');
            if (gate) gate.style.display = 'none';
            this.showToast('👑 Authenticated as Root Administrator');
            this.renderUsers();
          } else {
            alert('Invalid administrator credentials.');
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '🔐 Sign In as Root Administrator';
          }
        }
      });
    }

    const lockBtn = document.getElementById('adminLockBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        localStorage.removeItem('cch_admin_authenticated');
        this.checkAdminAuth();
        this.showToast('🔒 Admin portal locked', 'error');
      });
    }
  }

  checkAdminAuth() {
    const gate = document.getElementById('adminAuthGate');
    const isAuthed = localStorage.getItem('cch_admin_authenticated') === 'true';
    if (!isAuthed && gate) {
      gate.style.display = 'flex';
    } else if (gate) {
      gate.style.display = 'none';
    }
  }

  updateGitHubBanner() {
    const cfg = modulesService.getGitHubConfig();
    const repoLabel = document.getElementById('ghTargetRepoLabel');
    const branchBadge = document.getElementById('ghBranchBadge');
    const endpointLabel = document.getElementById('ghEndpointLabel');
    if (repoLabel) repoLabel.textContent = `${cfg.owner} / ${cfg.repo}`;
    if (branchBadge) branchBadge.textContent = `branch: ${cfg.branch || 'main'}`;
    if (endpointLabel) {
      endpointLabel.innerHTML = `API: <code style="color: #cbd5e1;">https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents?ref=${cfg.branch || 'main'}</code>`;
    }
  }

  renderBroadcastHistory() {
    const container = document.getElementById('broadcastHistoryList');
    if (!container) return;
    const history = firebaseService.getBroadcastHistory ? firebaseService.getBroadcastHistory() : [];
    if (history.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--admin-text-muted); font-size: 12.5px;">
          No broadcast notifications sent yet. Use the form above to dispatch alerts to all active mobile devices.
        </div>
      `;
      return;
    }
    container.innerHTML = history.map(item => `
      <div style="background: #08101a; border: 1px solid #1e3552; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <strong style="color: #38bdf8; font-size: 13.5px;">📢 ${item.title}</strong>
          <span style="font-size: 11px; color: #64748b;">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${new Date(item.timestamp).toLocaleDateString()}</span>
        </div>
        <p style="font-size: 12.5px; color: #cbd5e1; margin: 0; line-height: 1.4;">${item.message}</p>
        <div style="margin-top: 6px; font-size: 11px; color: #64748b;">Delivered via Cloud Firestore &amp; Multi-tab BroadcastChannel</div>
      </div>
    `).join('');
  }

  // --- TAB 5: SUBSCRIPTIONS & PRICING METHODS ---
  broadcastCloudUpdate(type, payload) {
    const message = { type, ...payload, timestamp: Date.now() };
    console.log(`[BROADCAST] Sending ${type}`, message);
    try {
      if (this._broadcastChannel) {
        this._broadcastChannel.postMessage(message);
      } else {
        const channel = new BroadcastChannel('critical-care-cloud');
        channel.postMessage(message);
      }
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  }

  showUndoToast(message, undoCallback) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = 'background: #1e3a5f; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; color: white; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);';
    toast.innerHTML = `
      <span style="flex:1">${message}</span>
      <button id="undoArchiveBtn" style="background:#10b981; color:white; border:none; border-radius:6px; padding:6px 14px; cursor:pointer; font-weight:700; font-size:12px;">↩ UNDO</button>
    `;
    container.appendChild(toast);

    let undone = false;
    toast.querySelector('#undoArchiveBtn').addEventListener('click', () => {
      undone = true;
      undoCallback();
      toast.remove();
    });

    setTimeout(() => {
      if (!undone) {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000);
  }

  renderPricingSettings() {
    let settings = {
      trialDays: 7,
      monthlyPrice: 500,
      semiannualPrice: 2250,
      annualPrice: 4000,
      currency: '₹'
    };
    try {
      const saved = localStorage.getItem('critical_care_subscription_settings');
      if (saved) settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {}

    const trialInput = document.getElementById('adminTrialDays');
    const monthlyInput = document.getElementById('adminPriceMonthly');
    const semiannualInput = document.getElementById('adminPriceSemiannual');
    const annualInput = document.getElementById('adminPriceAnnual');

    if (trialInput) trialInput.value = settings.trialDays;
    if (monthlyInput) monthlyInput.value = settings.monthlyPrice;
    if (semiannualInput) semiannualInput.value = settings.semiannualPrice;
    if (annualInput) annualInput.value = settings.annualPrice;

    this.updatePricingHints();
  }

  updatePricingHints() {
    const trialDays = document.getElementById('adminTrialDays')?.value || 7;
    const monthly = parseInt(document.getElementById('adminPriceMonthly')?.value || 500, 10);
    const semiannual = parseInt(document.getElementById('adminPriceSemiannual')?.value || 2250, 10);
    const annual = parseInt(document.getElementById('adminPriceAnnual')?.value || 4000, 10);

    const mHint = document.getElementById('adminMonthlyHint');
    const sHint = document.getElementById('adminSemiannualHint');
    const aHint = document.getElementById('adminAnnualHint');

    if (mHint) mHint.textContent = `Billed at ₹${monthly}/month after ${trialDays}-day trial.`;
    if (sHint) {
      const perMonth = Math.round(semiannual / 6);
      const savings = Math.max(0, Math.round((1 - (semiannual / (monthly * 6))) * 100));
      sHint.textContent = `₹${perMonth}/mo (₹${semiannual} every 6 mos) • Save ~${savings}%`;
    }
    if (aHint) {
      const perMonth = Math.round(annual / 12);
      const savings = Math.max(0, Math.round((1 - (annual / (monthly * 12))) * 100));
      aHint.textContent = `₹${perMonth}/mo (₹${annual} annually) • Save ~${savings}%`;
    }
  }

  savePricingSettings() {
    const settings = {
      trialDays: parseInt(document.getElementById('adminTrialDays')?.value || 7, 10),
      monthlyPrice: parseInt(document.getElementById('adminPriceMonthly')?.value || 500, 10),
      semiannualPrice: parseInt(document.getElementById('adminPriceSemiannual')?.value || 2250, 10),
      annualPrice: parseInt(document.getElementById('adminPriceAnnual')?.value || 4000, 10),
      currency: '₹'
    };

    try {
      localStorage.setItem('critical_care_subscription_settings', JSON.stringify(settings));
    } catch (e) {}

    // Save live to Google Cloud Firestore
    if (firebaseService && firebaseService.saveLivePricing) {
      firebaseService.saveLivePricing(settings);
    }

    this.broadcastCloudUpdate('PRICING_UPDATED', { settings });
    this.showToast(`💎 Live Pricing Saved to Cloud Firestore! (Trial: ${settings.trialDays}d | Monthly: ₹${settings.monthlyPrice} | 6-Mo: ₹${settings.semiannualPrice} | Annual: ₹${settings.annualPrice})`);
  }

  renderModuleCoverageMatrix() {
    const modules = modulesService.getPublishedModules();
    const tbody = document.getElementById('coverageMatrixBody');
    if (!tbody) return;

    let savedCoverage = {};
    try {
      const raw = localStorage.getItem('critical_care_module_coverage');
      if (raw) savedCoverage = JSON.parse(raw);
    } catch (e) {}

    tbody.innerHTML = modules.map((mod, index) => {
      // Prioritize mod.tier if set, otherwise fallback to savedCoverage, then 'pro'
      const currentTier = mod.tier || savedCoverage[mod.id] || 'pro';
      savedCoverage[mod.id] = currentTier; // ensure sync
      return `
        <tr class="admin-row-card">
          <td class="col-index">
            <span class="idx-badge">#${index + 1}</span>
          </td>
          <td class="col-title">
            <div class="row-title-main">${mod.title}</div>
            <div class="row-filename">${mod.id} (${mod.file})</div>
          </td>
          <td class="col-category">
            <span class="category-pill">${mod.category}</span>
          </td>
          <td class="col-tier">
            <span class="mobile-label">Tier:</span>
            <select class="coverage-select" data-id="${mod.id}">
              <option value="free" ${currentTier === 'free' ? 'selected' : ''}>🟢 Free (Trial &amp; Guests)</option>
              <option value="pro" ${currentTier === 'pro' ? 'selected' : ''}>💎 Pro Subscription (Paid)</option>
              <option value="vip" ${currentTier === 'vip' ? 'selected' : ''}>⭐ VIP Exclusive Pass Only</option>
            </select>
          </td>
          <td class="col-actions">
            <span class="coverage-tier-badge" id="badge-${mod.id}">
              ${currentTier === 'free' ? '<span class="badge badge-free">UNRESTRICTED</span>' : (currentTier === 'vip' ? '<span class="badge badge-vip">VIP ONLY</span>' : '<span class="badge badge-pro">PRO SUBSCRIBER</span>')}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    // Attach immediate sync on select change (never reverts or inverts)
    tbody.querySelectorAll('.coverage-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-id');
        const val = sel.value;
        const badgeSpan = document.getElementById(`badge-${id}`);
        if (badgeSpan) {
          if (val === 'free') badgeSpan.innerHTML = '<span class="badge badge-free">UNRESTRICTED</span>';
          else if (val === 'vip') badgeSpan.innerHTML = '<span class="badge badge-vip">VIP ONLY</span>';
          else badgeSpan.innerHTML = '<span class="badge badge-pro">PRO SUBSCRIBER</span>';
        }

        // 1. Immediately persist to localStorage
        savedCoverage[id] = val;
        try {
          localStorage.setItem('critical_care_module_coverage', JSON.stringify(savedCoverage));
        } catch (e) {}

        // 2. Immediately persist to modulesService
        try {
          const published = modulesService.getPublishedModules();
          const found = published.find(m => m.id === id);
          if (found) {
            found.tier = val;
            found.badgeText = val === 'free' ? 'FREE ACCESS' : (val === 'vip' ? 'VIP ONLY' : 'PRO LOCKED');
            found.badgeColor = val === 'free' ? 'emerald' : (val === 'vip' ? 'purple' : 'amber');
            modulesService._savePublishedModules(published);
          }
        } catch (e) {}

        // 3. Immediately persist to Cloud Firestore if connected
        if (firebaseService && firebaseService.saveLiveCoverageMatrix) {
          try {
            await firebaseService.saveLiveCoverageMatrix(savedCoverage);
          } catch (e) {}
        }

        // 4. Broadcast live update to mobile app and other tabs
        this.broadcastCloudUpdate('MODULE_TIERS_UPDATED', { modules: [{ id, tier: val }], coverage: savedCoverage });
        this.renderPublishedModules();
        this.showToast(`🛡️ Tier for "${id}" updated to ${val.toUpperCase()} and synchronized!`);
      });
    });
  }

  async saveModuleCoverageMatrix() {
    const selects = document.querySelectorAll('.coverage-select');
    const coverageMap = {};
    const modulesUpdateList = [];

    selects.forEach(sel => {
      const id = sel.getAttribute('data-id');
      const tier = sel.value;
      coverageMap[id] = tier;
      modulesUpdateList.push({ id, tier });

      // also sync with modulesService
      try {
        const published = modulesService.getPublishedModules();
        const found = published.find(m => m.id === id);
        if (found) {
          found.tier = tier;
          found.badgeText = tier === 'free' ? 'FREE ACCESS' : (tier === 'vip' ? 'VIP ONLY' : 'PRO LOCKED');
          found.badgeColor = tier === 'free' ? 'emerald' : (tier === 'vip' ? 'purple' : 'amber');
        }
        modulesService._savePublishedModules(published);
      } catch (e) {}
    });

    try {
      localStorage.setItem('critical_care_module_coverage', JSON.stringify(coverageMap));
    } catch (e) {}

    // Save live to Google Cloud Firestore
    if (firebaseService && firebaseService.saveLiveCoverageMatrix) {
      await firebaseService.saveLiveCoverageMatrix(coverageMap);
    }

    this.broadcastCloudUpdate('MODULE_TIERS_UPDATED', { modules: modulesUpdateList, coverage: coverageMap });
    this.renderPublishedModules();
    this.showToast(`🛡️ Module Coverage Matrix Saved to Cloud! Synchronized ${modulesUpdateList.length} simulators.`);
  }
}

// Immediate or DOM-ready instantiation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboardController();
  });
} else {
  window.adminDashboard = new AdminDashboardController();
}



