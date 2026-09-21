// Medical Disclaimer & Compliance Flow (App Store Guideline 1.4.1)

export const DISCLAIMER_STORAGE_KEY = 'critical_care_disclaimer_accepted_v1';
export const DISCLAIMER_EVENT = 'disclaimer_state_changed';

export class DisclaimerManager {
  constructor() {
    this.isAccepted = this.loadDisclaimerState();
  }

  loadDisclaimerState() {
    try {
      return localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  acceptDisclaimer() {
    this.isAccepted = true;
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    this.notifyStateChanged();
  }

  resetDisclaimer() {
    this.isAccepted = false;
    try {
      localStorage.removeItem(DISCLAIMER_STORAGE_KEY);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    this.notifyStateChanged();
  }

  notifyStateChanged() {
    window.dispatchEvent(
      new CustomEvent(DISCLAIMER_EVENT, {
        detail: {
          isAccepted: this.isAccepted
        }
      })
    );
  }
}

export const disclaimerManager = new DisclaimerManager();
