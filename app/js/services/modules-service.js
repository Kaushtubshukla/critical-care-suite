/**
 * Modules & GitHub Sync Engine
 * Manages published simulators, GitHub private repo detection queue, preview staging,
 * simulator archive & restoration, and real-time live synchronization between Admin Dashboard and Mobile App.
 */

import { SIMULATORS } from '../../data/simulators.js';
import { firebaseService } from './firebase-service.js';

class ModulesService {
  constructor() {
    this.storageKey = 'cch_live_published_modules';
    this.pendingKey = 'cch_github_pending_queue';
    this.archiveKey = 'cch_archived_modules';
    this.githubConfigKey = 'cch_github_config';
    this._initModules();
  }

  _initModules() {
    // Ensure archived list exists first
    let archived = [];
    try {
      const savedArchived = localStorage.getItem(this.archiveKey);
      if (savedArchived) archived = JSON.parse(savedArchived);
    } catch (e) {}
    const archivedIds = new Set(archived.map(a => a.id));

    // Seed initial published simulators from catalog if not present in localStorage
    const saved = localStorage.getItem(this.storageKey);
    let list = [];
    if (!saved) {
      list = SIMULATORS.filter(sim => !archivedIds.has(sim.id));
    } else {
      try {
        list = JSON.parse(saved);
        // Exclude any modules that are currently in the archive
        list = list.filter(m => !archivedIds.has(m.id));
        SIMULATORS.forEach(sim => {
          if (!archivedIds.has(sim.id) && !list.some(item => item.id === sim.id || item.file === sim.file)) {
            list.push(sim);
          }
        });
      } catch (e) {
        list = SIMULATORS.filter(sim => !archivedIds.has(sim.id));
      }
    }
    localStorage.setItem(this.storageKey, JSON.stringify(list));

    // Ensure archived list exists in storage
    if (!localStorage.getItem(this.archiveKey)) {
      localStorage.setItem(this.archiveKey, JSON.stringify([]));
    }

    // Ensure pending queue exists
    if (!localStorage.getItem(this.pendingKey)) {
      localStorage.setItem(this.pendingKey, JSON.stringify([]));
    }
  }

  // --- GitHub Configuration (Public & Private Repositories) ---
  getGitHubConfig() {
    try {
      const saved = localStorage.getItem(this.githubConfigKey);
      return saved ? JSON.parse(saved) : {
        owner: 'apoorvabeats-cyber',
        repo: 'ARDS-INTERACTIVE-SIMULATOR',
        branch: 'main',
        token: '' // GitHub Personal Access Token for Private Repos
      };
    } catch (e) {
      return { owner: 'apoorvabeats-cyber', repo: 'ARDS-INTERACTIVE-SIMULATOR', branch: 'main', token: '' };
    }
  }

  saveGitHubConfig(config) {
    localStorage.setItem(this.githubConfigKey, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('cch:github-config-updated', { detail: config }));
  }

  /**
   * Get all live published simulators
   */
  getPublishedModules() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : SIMULATORS;
    } catch (e) {
      return SIMULATORS;
    }
  }

  _savePublishedModules(modules) {
    localStorage.setItem(this.storageKey, JSON.stringify(modules));
    window.dispatchEvent(new CustomEvent('cch:modules-updated', { detail: modules }));
  }

  /**
   * Get all archived / deactivated simulators
   */
  getArchivedModules() {
    try {
      const data = localStorage.getItem(this.archiveKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  _saveArchivedModules(modules) {
    localStorage.setItem(this.archiveKey, JSON.stringify(modules));
    window.dispatchEvent(new CustomEvent('cch:archived-updated', { detail: modules }));
  }

  /**
   * Get newly detected GitHub modules awaiting owner review
   */
  getPendingGitHubModules() {
    try {
      const data = localStorage.getItem(this.pendingKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  _savePendingQueue(queue) {
    localStorage.setItem(this.pendingKey, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('cch:github-queue-updated', { detail: queue }));
  }

  /**
   * 1-Click Publish from GitHub Queue to Live App
   */
  async publishFromGitHub(pendingId, config) {
    const queue = this.getPendingGitHubModules();
    const item = queue.find(q => q.id === pendingId);
    if (!item) throw new Error('Pending module not found in queue');

    const published = this.getPublishedModules();
    
    // Clear isLatest flag from existing modules so only this newly published one is featured
    published.forEach(m => { m.isLatest = false; });

    const selectedCategory = config.category || item.suggestedCategory || 'respiratory';
    let catLabel = config.categoryLabel;
    if (!catLabel) {
      if (selectedCategory === 'respiratory') catLabel = 'Respiratory Care';
      else if (selectedCategory === 'neuro') catLabel = 'Neurocritical Care';
      else if (selectedCategory === 'cardiac') catLabel = 'Cardiac & Shock';
      else if (selectedCategory === 'abg') catLabel = 'ABG Diagnostics';
      else catLabel = `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Critical Care`;
    }

    // Create new published module record
    const newModule = {
      id: config.id || item.id,
      title: config.title || item.suggestedTitle,
      subtitle: config.subtitle || 'Clinical Decision Tool & Simulator',
      category: selectedCategory,
      categoryLabel: catLabel,
      tier: config.tier || 'pro',
      file: item.filename,
      badgeText: config.tier === 'free' ? 'FREE ACCESS' : 'PRO LOCKED',
      badgeColor: config.tier === 'free' ? 'emerald' : 'amber',
      description: config.description || item.description || 'Interactive clinical decision simulator with physiological algorithms.',
      tags: config.tags || ['New Release', 'Clinical Simulation'],
      duration: config.duration || '10 min',
      casesCount: config.casesCount || 'Clinical Scenarios',
      colorGradient: config.tier === 'free' ? 'from-emerald-600 to-teal-800' : 'from-indigo-600 to-slate-900',
      iconBg: selectedCategory === 'cardiac' ? '#b91c1c' : (selectedCategory === 'neuro' ? '#4338ca' : (selectedCategory === 'abg' ? '#047857' : '#0f766e')),
      highlights: config.highlights || ['Guideline Compliance', 'Interactive Decision Branches'],
      downloadUrl: item.downloadUrl || null,
      rawUrl: item.downloadUrl || null,
      isLatest: true,
      isNewRelease: true,
      publishedAt: new Date().toISOString()
    };

    // Add to published list at the top
    published.unshift(newModule);
    this._savePublishedModules(published);

    // Remove from pending queue
    const remainingQueue = queue.filter(q => q.id !== pendingId);
    this._savePendingQueue(remainingQueue);

    // Synchronize to Cloud Firestore across all devices and domains
    if (firebaseService && firebaseService.saveLiveCatalog) {
      console.log(`[MODULES-SVC] Syncing newly published module "${newModule.title}" to Cloud Firestore...`);
      try {
        await firebaseService.saveLiveCatalog(this.getArchivedModules(), published);
      } catch (e) {
        console.warn('[MODULES-SVC] Cloud save notice:', e);
      }
    }

    return newModule;
  }



  /**
   * Toggle Module Tier (Free vs Pro)
   */
  async toggleTier(moduleId, newTier) {
    const published = this.getPublishedModules();
    const mod = published.find(m => m.id === moduleId);
    if (mod) {
      mod.tier = newTier;
      mod.badgeText = newTier === 'free' ? 'FREE ACCESS' : 'PRO LOCKED';
      mod.badgeColor = newTier === 'free' ? 'emerald' : 'amber';
      this._savePublishedModules(published);
      if (firebaseService && firebaseService.saveLiveCatalog) {
        try {
          await firebaseService.saveLiveCatalog(this.getArchivedModules(), published);
        } catch (e) {}
      }
      return mod;
    }
    throw new Error('Module not found');
  }

  /**
   * Remove / Archive Simulator from Live App (Moves to Inactive/Archived tab)
   */
  archiveModule(moduleId) {
    const published = this.getPublishedModules();
    const mod = published.find(m => m.id === moduleId);
    if (!mod) throw new Error('Simulator not found');

    console.log(`[MODULES-SVC] Archiving "${mod.title}" (${moduleId})`);

    const updatedPublished = published.filter(m => m.id !== moduleId);
    const archived = this.getArchivedModules();

    // Prevent duplicate entries in archive
    const updatedArchived = [
      { ...mod, archivedAt: new Date().toISOString() },
      ...archived.filter(a => a.id !== moduleId)
    ];

    this._savePublishedModules(updatedPublished);
    this._saveArchivedModules(updatedArchived);

    console.log(`[MODULES-SVC] Published: ${updatedPublished.length}, Archived: ${updatedArchived.length}`);

    // Synchronize to Cloud Firestore across all devices and domains
    if (firebaseService && firebaseService.saveLiveCatalog) {
      console.log('[MODULES-SVC] Saving catalog to Cloud Firestore...');
      firebaseService.saveLiveCatalog(updatedArchived, updatedPublished).catch((e) => {
        console.warn('[MODULES-SVC] Firestore save error:', e);
      });
    }
    return true;
  }

  /**
   * 1-Click Restore Simulator from Archive back to Live App
   */
  restoreModule(moduleId) {
    const archived = this.getArchivedModules();
    const mod = archived.find(a => a.id === moduleId);
    if (!mod) throw new Error('Archived simulator not found');

    const updatedArchived = archived.filter(a => a.id !== moduleId);
    const published = this.getPublishedModules();

    const restoredMod = { ...mod };
    delete restoredMod.archivedAt;
    restoredMod.restoredAt = new Date().toISOString();

    const updatedPublished = [restoredMod, ...published.filter(p => p.id !== moduleId)];

    this._saveArchivedModules(updatedArchived);
    this._savePublishedModules(updatedPublished);

    // Synchronize to Cloud Firestore across all devices and domains
    if (firebaseService && firebaseService.saveLiveCatalog) {
      firebaseService.saveLiveCatalog(updatedArchived, updatedPublished).catch(() => {});
    }
    return restoredMod;
  }

  /**
   * Permanently Delete Simulator (Safety net: preserved in Review Queue for 1-click re-import)
   */
  permanentlyDeleteModule(moduleId) {
    const archived = this.getArchivedModules();
    const published = this.getPublishedModules();
    const target = archived.find(a => a.id === moduleId) || published.find(p => p.id === moduleId);

    const updatedArchived = archived.filter(a => a.id !== moduleId);
    this._saveArchivedModules(updatedArchived);

    const updatedPublished = published.filter(p => p.id !== moduleId);
    this._savePublishedModules(updatedPublished);

    // Safety Net: stage in review queue so the physical file is never lost and can be re-published anytime!
    if (target) {
      const queue = this.getPendingGitHubModules();
      if (!queue.some(q => q.id === target.id || q.filename === target.file)) {
        queue.unshift({
          id: target.id,
          filename: target.file,
          suggestedTitle: target.title,
          suggestedCategory: target.category || 'respiratory',
          suggestedTier: target.tier || 'pro',
          description: 'Deleted simulator preserved from library. Click "🚀 Publish to Live App" to re-activate anytime.'
        });
        this._savePendingQueue(queue);
      }
    }

    // Synchronize to Cloud Firestore across all devices and domains
    if (firebaseService && firebaseService.saveLiveCatalog) {
      firebaseService.saveLiveCatalog(updatedArchived, updatedPublished).catch(() => {});
    }
    return true;
  }

  /**
   * Emergency 1-Click Library Restore: Restores any missing canonical simulators
   */
  restoreAllCanonicalModules() {
    let published = this.getPublishedModules();
    let count = 0;
    SIMULATORS.forEach(sim => {
      if (!published.some(p => p.id === sim.id || p.file === sim.file)) {
        published.push(sim);
        count++;
      }
    });
    // Remove from archive if restored to published
    let archived = this.getArchivedModules();
    archived = archived.filter(a => !published.some(p => p.id === a.id));
    this._saveArchivedModules(archived);
    this._savePublishedModules(published);

    // Synchronize to Cloud Firestore across all devices and domains
    if (firebaseService && firebaseService.saveLiveCatalog) {
      firebaseService.saveLiveCatalog(archived, published).catch(() => {});
    }
    return count;
  }

  /**
   * Real GitHub Repository Scanner (Works with both Public & Private Repositories via PAT)
   */
  async scanGitHubRepository() {
    const cfg = this.getGitHubConfig();
    const owner = (cfg.owner || '').trim();
    const repo = (cfg.repo || '').trim();
    const branch = (cfg.branch || 'main').trim();
    const token = (cfg.token || '').trim();

    const currentQueue = this.getPendingGitHubModules();
    const published = this.getPublishedModules();
    const archived = this.getArchivedModules();

    let newFoundCount = 0;
    let scanMethod = 'local';

    // 1. If GitHub repo information is present, attempt live GitHub REST API call
    if (owner && repo) {
      try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;
        const headers = {
          'Accept': 'application/vnd.github.v3+json'
        };
        if (token) {
          headers['Authorization'] = `token ${token}`;
        }

        const res = await fetch(apiUrl, { headers });
        if (res.ok) {
          scanMethod = token ? 'github-private-api' : 'github-public-api';
          const files = await res.json();
          if (Array.isArray(files)) {
            const ignored = ['index.html', 'manifest.json', 'sw.js', 'Critical_Care_App_Project_Proposal.html'];
            
            files.forEach(fileObj => {
              if (fileObj.type === 'file' && fileObj.name.endsWith('.html') && !ignored.includes(fileObj.name)) {
                const alreadyPublished = published.some(p => p.file === fileObj.name);
                const alreadyArchived = archived.some(a => a.file === fileObj.name);
                const alreadyInQueue = currentQueue.some(q => q.filename === fileObj.name);

                if (!alreadyPublished && !alreadyArchived && !alreadyInQueue) {
                  // Derive suggested metadata from filename
                  const cleanName = fileObj.name.replace('.html', '').replace(/_/g, ' ');
                  let cat = 'respiratory';
                  let catLabel = 'Respiratory Care';
                  if (/stroke|tbi|ich|sah|epilep|cns|seizure/i.test(cleanName)) {
                    cat = 'neuro';
                    catLabel = 'Neurocritical Care';
                  } else if (/cardiac|shock|ecg|acls|rhythm|hypoten|hemo/i.test(cleanName)) {
                    cat = 'cardiac';
                    catLabel = 'Cardiac & Shock';
                  } else if (/abg|blood/i.test(cleanName)) {
                    cat = 'abg';
                    catLabel = 'ABG Diagnostics';
                  }

                  currentQueue.push({
                    id: fileObj.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    filename: fileObj.name,
                    downloadUrl: fileObj.download_url,
                    gitUrl: fileObj.git_url,
                    htmlUrl: fileObj.html_url,
                    detectedAt: new Date().toISOString(),
                    suggestedTitle: cleanName,
                    suggestedCategory: cat,
                    suggestedCategoryLabel: catLabel,
                    suggestedTier: 'pro',
                    description: `Newly committed clinical simulator module from branch "${branch}". Complete with interactive decision algorithms and physiological telemetry.`
                  });
                  newFoundCount++;
                }
              }
            });

            this._savePendingQueue(currentQueue);
            return {
              success: true,
              method: scanMethod,
              newCount: newFoundCount,
              totalPending: currentQueue.length,
              repo: `${owner}/${repo}`
            };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 404 || res.status === 401) {
            throw new Error(`GitHub ${res.status}: Repository is private or not found. Please provide a valid Personal Access Token (PAT) in GitHub Settings.`);
          }
          throw new Error(errData.message || `GitHub API returned HTTP ${res.status}`);
        }
      } catch (apiErr) {
        console.warn('GitHub live API notice:', apiErr.message);
        // If user explicitly configured token or asked for scan, throw the error
        if (token || (owner && repo)) {
          throw apiErr;
        }
      }
    }

    this._savePendingQueue(currentQueue);
    return {
      success: true,
      method: scanMethod,
      newCount: newFoundCount,
      totalPending: currentQueue.length
    };
  }

  /**
   * Fetch raw HTML content for preview (Handles Private Repos using PAT)
   */
  async fetchSimulatorRawContent(filename) {
    const cfg = this.getGitHubConfig();
    if (cfg.token && cfg.owner && cfg.repo) {
      try {
        const rawApi = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${filename}?ref=${cfg.branch || 'main'}`;
        const res = await fetch(rawApi, {
          headers: {
            'Authorization': `token ${cfg.token}`,
            'Accept': 'application/vnd.github.v3.raw'
          }
        });
        if (res.ok) {
          return await res.text();
        }
      } catch (e) {
        console.warn('Error fetching raw private content:', e);
      }
    }
    // Direct local / relative fetch fallback
    const basePath = window.location.pathname.includes('/admin/') ? '../' : './';
    const res = await fetch(`${basePath}${filename}`);
    return await res.text();
  }
}

export const modulesService = new ModulesService();
window.modulesService = modulesService;
