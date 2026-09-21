// Presentation Controller for Client Demo & Stakeholder Walkthroughs

import { subscriptionManager } from './subscription.js';
import { disclaimerManager } from './disclaimer.js';

export class PresentationController {
  constructor(app) {
    this.app = app;
    this.currentFrame = 'iphone'; // 'iphone', 'pixel', 'fullscreen'
    this.isCollapsed = false;
  }

  init() {
    this.bindEvents();
    this.applyFrame(this.currentFrame);
  }

  setDeviceFrame(frameType) {
    this.currentFrame = frameType;
    this.applyFrame(frameType);
  }

  applyFrame(frameType) {
    const frameContainer = document.getElementById('deviceFrameContainer');
    const deviceButtons = document.querySelectorAll('[data-frame-btn]');
    
    if (!frameContainer) return;

    frameContainer.classList.remove('frame-iphone', 'frame-pixel', 'frame-fullscreen');

    if (frameType === 'iphone') {
      frameContainer.classList.add('frame-iphone');
    } else if (frameType === 'pixel') {
      frameContainer.classList.add('frame-pixel');
    } else {
      frameContainer.classList.add('frame-fullscreen');
    }

    deviceButtons.forEach(btn => {
      if (btn.getAttribute('data-frame-btn') === frameType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update screen status bar time
    this.updateClock();
  }

  updateClock() {
    const timeEls = document.querySelectorAll('.device-status-time');
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    timeEls.forEach(el => el.textContent = `${hours}:${minutes}`);
  }

  bindEvents() {
    // Frame toggle buttons
    document.querySelectorAll('[data-frame-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const frame = e.currentTarget.getAttribute('data-frame-btn');
        this.setDeviceFrame(frame);
      });
    });

    // Pro Toggle switch in Presenter HUD
    const tierToggleBtn = document.getElementById('hudTierToggleBtn');
    if (tierToggleBtn) {
      tierToggleBtn.addEventListener('click', () => {
        const newTier = subscriptionManager.toggleTier();
        this.app.showToast(
          newTier === 'pro' 
            ? '💎 Mode Changed: PRO Active Subscriber (All tools unlocked)'
            : '🔒 Mode Changed: FREE Tier User (11 tools paywalled)',
          newTier === 'pro' ? 'success' : 'info'
        );
      });
    }

    // Reset Disclaimer in Presenter HUD
    const resetDisclaimerBtn = document.getElementById('hudResetDisclaimerBtn');
    if (resetDisclaimerBtn) {
      resetDisclaimerBtn.addEventListener('click', () => {
        disclaimerManager.resetDisclaimer();
        this.app.showDisclaimerModal();
        this.app.showToast('ℹ️ Medical Disclaimer reset for next launch', 'info');
      });
    }

    // Toggle Presenter HUD minimize/expand
    const hudToggleMinimize = document.getElementById('hudToggleMinimize');
    const hudCard = document.getElementById('presentationHud');
    if (hudToggleMinimize && hudCard) {
      hudToggleMinimize.addEventListener('click', () => {
        hudCard.classList.toggle('minimized');
      });
    }

    // Quick Simulator Jump Dropdown
    const quickJumpSelect = document.getElementById('hudQuickJump');
    if (quickJumpSelect) {
      quickJumpSelect.addEventListener('change', (e) => {
        const simId = e.target.value;
        if (simId) {
          this.app.launchSimulator(simId);
          e.target.value = '';
        }
      });
    }

    // Periodic clock update
    setInterval(() => this.updateClock(), 30000);
  }
}
