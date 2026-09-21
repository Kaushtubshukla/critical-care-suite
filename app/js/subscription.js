// Subscription & Paywall Management (Simulating RevenueCat / Apple StoreKit / Google Play Billing & Firebase Entitlements)

import { firebaseService } from './services/firebase-service.js';

export const SUBSCRIPTION_STORAGE_KEY = 'critical_care_subscription_tier';
export const SUBSCRIPTION_EVENT = 'subscription_state_changed';

export class SubscriptionManager {
  constructor() {
    this.currentTier = this.loadSubscriptionState(); // 'free' or 'pro'
    this.selectedPlan = 'annual'; // 'annual' or 'monthly'
    this.plans = {
      monthly: {
        id: 'cc_pro_monthly_499',
        name: 'Monthly Pro',
        price: '₹399',
        period: '/month',
        billingText: 'Billed monthly. Cancel anytime.',
        trialText: null,
        badge: null,
        savings: null
      },
      annual: {
        id: 'cc_pro_annual_3999',
        name: 'Annual Pro (All-Access)',
        price: '₹2,999',
        period: '/year',
        equivalent: '₹249/mo',
        billingText: 'Billed annually after 7-day free trial.',
        trialText: '7-DAY FREE TRIAL',
        badge: 'MOST POPULAR',
        savings: 'SAVE 38%'
      }
    };

    // Listen for Firebase Auth or VIP entitlement changes
    window.addEventListener('cch:auth-changed', (e) => {
      const user = e.detail;
      if (user && (user.tier === 'pro' || user.isVIP || user.role === 'admin')) {
        this.saveSubscriptionState('pro');
      } else if (!user) {
        // Retain local tier or reset
      }
    });
  }

  loadSubscriptionState() {
    if (firebaseService && firebaseService.hasProAccess()) {
      return 'pro';
    }
    try {
      const saved = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
      return saved === 'pro' ? 'pro' : 'free';
    } catch (e) {
      return 'free';
    }
  }

  saveSubscriptionState(tier) {
    this.currentTier = tier;
    try {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, tier);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    this.notifyStateChanged();
  }

  isPro() {
    if (firebaseService && firebaseService.hasProAccess()) {
      return true;
    }
    return this.currentTier === 'pro';
  }

  setTier(tier) {
    if (tier === 'pro' || tier === 'free') {
      this.saveSubscriptionState(tier);
    }
  }

  toggleTier() {
    const newTier = this.isPro() ? 'free' : 'pro';
    this.saveSubscriptionState(newTier);
    return newTier;
  }

  setSelectedPlan(planKey) {
    if (this.plans[planKey]) {
      this.selectedPlan = planKey;
    }
  }

  notifyStateChanged() {
    window.dispatchEvent(
      new CustomEvent(SUBSCRIPTION_EVENT, {
        detail: {
          tier: this.currentTier,
          isPro: this.isPro()
        }
      })
    );
  }

  /**
   * Simulates in-app purchase flow with realistic delay & feedback
   */
  async simulatePurchase(planKey = this.selectedPlan) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        this.saveSubscriptionState('pro');
        await firebaseService.upgradeToPro();
        resolve({
          success: true,
          productId: this.plans[planKey]?.id || 'cc_pro_annual_3999',
          transactionId: 'sim_txn_' + Date.now().toString(36),
          purchaseDate: new Date().toISOString()
        });
      }, 1000);
    });
  }

  /**
   * Apple App Store / Google Play Restore Purchases requirement
   */
  async restorePurchases() {
    return new Promise((resolve) => {
      setTimeout(async () => {
        const user = firebaseService.currentUser;
        if (user && (user.tier === 'pro' || user.isVIP || user.role === 'admin')) {
          this.saveSubscriptionState('pro');
          resolve({ success: true, restored: true, message: 'Active Pro subscription found & restored!' });
        } else {
          // If already local pro
          if (this.currentTier === 'pro') {
            resolve({ success: true, restored: true, message: 'Local Pro subscription verified & restored.' });
          } else {
            resolve({ success: true, restored: false, message: 'No prior active purchases found on this account.' });
          }
        }
      }, 800);
    });
  }
}

export const subscriptionManager = new SubscriptionManager();
window.subscriptionManager = subscriptionManager;
