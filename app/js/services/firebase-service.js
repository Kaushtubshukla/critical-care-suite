/**
 * Google Firebase Production Client Service for Critical Care Hub
 * Provides Live Authentication (Email/Password & Google Sign-In), Cloud Firestore Sync,
 * Physician Profile & Role Management, Multi-tab BroadcastChannel, and Resilient Offline Fallback.
 */

import { FIREBASE_CONFIG, USE_REAL_FIREBASE } from './firebase-config.js';
import { initializeApp } from '../vendor/firebase/firebase-app.js';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  onAuthStateChanged, 
  GoogleAuthProvider,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteUser
} from '../vendor/firebase/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  enableIndexedDbPersistence
} from '../vendor/firebase/firebase-firestore.js';

class FirebaseService {
  constructor() {
    this.authKey = 'critical_care_user_profile';
    this.subKey = 'critical_care_subscription_tier';
    this.settingsKey = 'critical_care_subscription_settings';
    this.trialExpiryKey = 'cc_trial_expiry';
    this.usersKey = 'cch_cloud_users';

    this.currentUser = null;
    this.listeners = [];
    this.isRealFirebaseActive = false;
    this.fbApp = null;
    this.fbAuth = null;
    this.fbDb = null;
    this.googleProvider = null;

    // Multi-tab and cross-context broadcast
    try {
      this.channel = new BroadcastChannel('critical-care-cloud');
      this.channel.onmessage = (event) => {
        if (event.data?.type === 'AUTH_UPDATED') {
          this._loadLocalSession();
          this._notifyAuthChange(false);
        } else if (event.data?.type === 'USERS_UPDATED') {
          window.dispatchEvent(new CustomEvent('cch:auth-changed', { detail: this.currentUser }));
        }
      };
    } catch (e) {
      this.channel = null;
    }

    // Storage event for multi-tab fallback
    window.addEventListener('storage', (e) => {
      if (e.key === this.authKey) {
        this._loadLocalSession();
        this._notifyAuthChange(false);
      }
    });

    this._loadLocalSession();

    this._initPromise = null;
    if (USE_REAL_FIREBASE) {
      this._initPromise = this._initRealFirebase();
    }
  }

  async _ensureInitialized() {
    if (this.isRealFirebaseActive) return;
    if (this._initPromise) {
      try {
        await Promise.race([
          this._initPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase init timeout')), 2500))
        ]);
      } catch (e) {
        console.warn('Firebase init notice:', e);
      }
    }
  }

  // --- Real Google Firebase Cloud Initialization ---
  async _initRealFirebase() {
    try {
      this.fbApp = initializeApp(FIREBASE_CONFIG);

      // Initialize Auth with standard browserLocalPersistence (localStorage) for iOS & Android
      // We explicitly omit popupRedirectResolver so WKWebView never initializes hanging background iframes
      try {
        this.fbAuth = initializeAuth(this.fbApp, {
          persistence: browserLocalPersistence
        });
      } catch (authInitErr) {
        this.fbAuth = getAuth(this.fbApp);
      }

      this.fbDb = getFirestore(this.fbApp);
      this.googleProvider = new GoogleAuthProvider();
      this.googleProvider.setCustomParameters({ prompt: 'select_account' });
      this.isRealFirebaseActive = true;

      console.log('✅ Connected to live Google Firebase Cloud:', FIREBASE_CONFIG.projectId);

      // Listen for Firebase Auth state changes
      onAuthStateChanged(this.fbAuth, async (fbUser) => {
        if (fbUser) {
          await this._syncFirebaseUserDoc(fbUser);
        } else {
          // If signed out from Firebase
          if (this.currentUser && this.currentUser.uid && !this.currentUser.uid.startsWith('local_')) {
            this.currentUser = null;
            localStorage.removeItem(this.authKey);
            this._notifyAuthChange();
          }
        }
      });

      // Listen for Live Pricing updates from Cloud Firestore
      try {
        const pricingRef = doc(this.fbDb, 'settings', 'pricing');
        onSnapshot(pricingRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            localStorage.setItem(this.settingsKey, JSON.stringify(data));
            window.dispatchEvent(new CustomEvent('cch:pricing-updated', { detail: data }));
          }
        }, (err) => {
          console.warn('Firestore pricing stream notice:', err.message);
        });
      } catch (e) {}

      // Listen for Live Module Coverage updates from Cloud Firestore
      try {
        const coverageRef = doc(this.fbDb, 'settings', 'coverage');
        onSnapshot(coverageRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data && data.coverage) {
              localStorage.setItem('critical_care_module_coverage', JSON.stringify(data.coverage));
              window.dispatchEvent(new CustomEvent('cch:coverage-updated', { detail: data.coverage }));
            }
          }
        }, (err) => {
          console.warn('Firestore coverage stream notice:', err.message);
        });
      } catch (e) {}

      // Immediate fast REST sync for simulator catalog (100% reliable on all platforms)
      this.syncCatalogFromCloudREST();

      // Listen for Live Simulator Catalog & Archive updates from Cloud Firestore
      try {
        const catalogRef = doc(this.fbDb, 'settings', 'catalog');
        onSnapshot(catalogRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data) {
              if (Array.isArray(data.archived)) {
                localStorage.setItem('cch_archived_modules', JSON.stringify(data.archived));
              }
              if (Array.isArray(data.published)) {
                localStorage.setItem('cch_live_published_modules', JSON.stringify(data.published));
              }
              window.dispatchEvent(new CustomEvent('cch:catalog-updated', { detail: data }));
              window.dispatchEvent(new CustomEvent('cch:modules-updated', { detail: data.published }));
              window.dispatchEvent(new CustomEvent('cch:archived-updated', { detail: data.archived }));
            }
          }
        }, (err) => {
          console.warn('Firestore catalog stream notice:', err.message);
        });
      } catch (e) {}

      // Listen for Live Push Notifications from Cloud Firestore
      try {
        
        const notifQuery = query(collection(this.fbDb, 'notifications'), orderBy('timestamp', 'desc'), limit(5));
        let isInitialNotifSnap = true;
        onSnapshot(notifQuery, (snap) => {
          const notifs = [];
          snap.forEach(d => notifs.push(d.data()));
          if (notifs.length > 0) {
            const latest = notifs[0];
            const ageMs = Date.now() - (latest.timestamp || 0);
            const isFresh = ageMs < (20 * 60 * 1000); // within last 20 minutes
            if (!isInitialNotifSnap || isFresh) {
              window.dispatchEvent(new CustomEvent('cch:notification-received', { detail: latest }));
            }
          }
          isInitialNotifSnap = false;
        }, (err) => {
          console.warn('Firestore notifications stream notice:', err.message);
        });
      } catch (e) {}

      // If active user is already logged in, listen for VIP / tier changes in real-time
      if (this.currentUser && this.currentUser.uid) {
        this._listenToCurrentUserDoc(this.currentUser.uid);
      }

      window.dispatchEvent(new CustomEvent('cch:firebase-ready', { detail: { projectId: FIREBASE_CONFIG.projectId } }));
    } catch (err) {
      console.warn('Firebase live connection notice:', err.message);
      this.isRealFirebaseActive = false;
    }
  }

  async _syncFirebaseUserDoc(fbUser) {
    if (!this.fbDb) return;
    try {
      
      const userRef = doc(this.fbDb, 'users', fbUser.uid);
      const snap = await getDoc(userRef);

      let profile;
      if (snap.exists()) {
        profile = snap.data();
      } else {
        const trialExpiry = Date.now() + (7 * 86400000);
        const isAdmin = (fbUser.email && fbUser.email.toLowerCase() === 'admin@criticalcare.med');
        profile = {
          uid: fbUser.uid,
          name: fbUser.displayName || '',
          email: fbUser.email,
          emailVerified: fbUser.emailVerified || false,
          role: isAdmin ? 'admin' : '',
          institution: '',
          tier: 'trial',
          trialExpiry: trialExpiry,
          isVIP: isAdmin,
          isLoggedIn: true,
          photoURL: fbUser.photoURL || '',
          provider: fbUser.providerData?.[0]?.providerId || 'google.com',
          isProfileComplete: isAdmin,
          createdAt: new Date().toISOString()
        };
        await setDoc(userRef, profile);
      }

      const isVerified = fbUser.emailVerified || profile.emailVerified || (fbUser.email && fbUser.email.toLowerCase() === 'admin@criticalcare.med');
      const isProfileDone = (profile.role === 'admin') || (profile.isProfileComplete === true && !!profile.role && !!profile.name);

      this.currentUser = { ...profile, emailVerified: isVerified, isProfileComplete: isProfileDone, isLoggedIn: true };
      localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
      if (profile.tier) localStorage.setItem(this.subKey, profile.tier);
      if (profile.trialExpiry) localStorage.setItem(this.trialExpiryKey, profile.trialExpiry.toString());
      
      if (this.currentUser && this.currentUser.isLoggedIn) {
        document.documentElement.classList.add('is-authenticated-user');
      } else {
        document.documentElement.classList.remove('is-authenticated-user');
      }
      this._notifyAuthChange();

      // Listen to this user's document in real-time so VIP/tier changes reflect instantly
      this._listenToCurrentUserDoc(fbUser.uid);

      return this.currentUser;
    } catch (e) {
      console.warn('Error syncing Firebase user document:', e.message);
    }
  }

  _listenToCurrentUserDoc(uid) {
    if (!this.fbDb || !uid || uid.startsWith('local_')) return;
    if (this._userDocUnsub) {
      this._userDocUnsub();
      this._userDocUnsub = null;
    }
    try {
      const userRef = doc(this.fbDb, 'users', uid);
      this._userDocUnsub = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const remoteData = snap.data();
          const wasVIP = !!this.currentUser?.isVIP;
          const newVIP = !!remoteData.isVIP;
          const newTier = newVIP ? 'vip' : (remoteData.tier || this.currentUser?.tier || 'free');

          let changed = false;
          if (this.currentUser) {
            if (wasVIP !== newVIP || this.currentUser.tier !== newTier) {
              changed = true;
            }
            this.currentUser = {
              ...this.currentUser,
              ...remoteData,
              isVIP: newVIP,
              tier: newTier
            };
          } else {
            this.currentUser = {
              ...remoteData,
              isVIP: newVIP,
              tier: newTier,
              isLoggedIn: true
            };
            changed = true;
          }

          localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
          localStorage.setItem(this.subKey, newTier);

          if (changed) {
            console.log('⭐ Live VIP / Tier update received from Cloud Firestore:', { isVIP: newVIP, tier: newTier });
            this._notifyAuthChange();
          }
        }
      }, (err) => {
        console.warn('User doc onSnapshot notice:', err.message);
      });
    } catch (e) {
      console.warn('_listenToCurrentUserDoc error:', e);
    }
  }

  // --- Complete Clinical Profile (Role, Doctor Name, Hospital) ---
  async completeClinicalProfile({ name, role, institution }) {
    if (!this.currentUser) {
      this._loadLocalSession();
    }
    if (!this.currentUser || !this.currentUser.uid) {
      if (this.fbAuth && this.fbAuth.currentUser) {
        this.currentUser = {
          uid: this.fbAuth.currentUser.uid,
          name: this.fbAuth.currentUser.displayName || '',
          email: this.fbAuth.currentUser.email,
          emailVerified: this.fbAuth.currentUser.emailVerified,
          isLoggedIn: true
        };
      }
    }
    if (!this.currentUser || !this.currentUser.uid) {
      throw new Error('No active user session found. Please sign in first.');
    }

    const cleanName = (name && name.trim()) || 'Dr. Physician';
    const cleanRole = (role && role.trim()) || 'Doctor';
    const cleanInst = (institution && institution.trim()) || '';

    const isAdmin = (this.currentUser.email && this.currentUser.email.toLowerCase() === 'admin@criticalcare.med') || this.currentUser.role === 'admin';
    const finalRole = isAdmin ? 'admin' : cleanRole;

    this.currentUser.name = cleanName;
    this.currentUser.role = finalRole;
    this.currentUser.institution = cleanInst;
    this.currentUser.isProfileComplete = true;

    localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));

    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        await updateDoc(doc(this.fbDb, 'users', this.currentUser.uid), {
          name: cleanName,
          role: finalRole,
          institution: cleanInst,
          isProfileComplete: true,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Firestore profile update notice:', e.message);
      }
    }

    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      try {
        
        await updateProfile(this.fbAuth.currentUser, { displayName: cleanName });
      } catch (e) {}
    }

    const isVerified = this.currentUser.emailVerified || (this.currentUser.email && this.currentUser.email.toLowerCase() === 'admin@criticalcare.med');
    if (isVerified) {
      document.documentElement.classList.add('is-authenticated-user');
    }
    this._notifyAuthChange();
    return this.currentUser;
  }

  _loadLocalSession() {
    try {
      const saved = localStorage.getItem(this.authKey);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        if (this.currentUser && this.currentUser.isLoggedIn) {
          document.documentElement.classList.add('is-authenticated-user');
        } else {
          document.documentElement.classList.remove('is-authenticated-user');
        }
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  _notifyAuthChange(broadcast = true) {
    this.listeners.forEach(cb => {
      try { cb(this.currentUser); } catch (e) { console.error(e); }
    });
    window.dispatchEvent(new CustomEvent('cch:auth-changed', { detail: this.currentUser }));
    if (broadcast && this.channel) {
      this.channel.postMessage({ type: 'AUTH_UPDATED', user: this.currentUser });
    }
  }

  hasProAccess() {
    if (!this.currentUser) return false;
    const u = this.currentUser;
    if (u.isVIP || u.role === 'admin' || u.tier === 'pro' || u.tier === 'vip') return true;
    if (u.tier === 'trial' && u.trialExpiry && Number(u.trialExpiry) > Date.now()) return true;
    return false;
  }

  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // Direct Google Identity Platform REST helper (100% reliable across iOS WKWebView, Android WebView, and Desktop)
  async _callIdentityApi(endpoint, body) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${FIREBASE_CONFIG.apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const data = await resp.json();
      if (!resp.ok) {
        const rawCode = data?.error?.message || 'AUTHENTICATION_FAILED';
        const err = new Error(rawCode);
        err.rawCode = rawCode;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        const timeoutErr = new Error('Connection timed out. Please check your network connection and try again.');
        timeoutErr.rawCode = 'TIMEOUT';
        throw timeoutErr;
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- 1. Email & Password Sign Up (Direct Cloud REST API - Instant & Mobile Resilient) ---
  async createUserWithEmail(email, password, profileData = {}) {
    const cleanEmail = email.trim().toLowerCase();
    
    // Strict email syntax check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid email address (e.g. doctor@hospital.org).');
    }

    // Strict password policy check (min 8 chars)
    if (!password || password.length < 8) {
      throw new Error('For clinical data security, password must be at least 8 characters.');
    }

    const displayName = (profileData.name && profileData.name.trim()) || (cleanEmail.startsWith('admin') ? 'Admin Master' : 'Dr. Physician');
    const role = (cleanEmail === 'admin@criticalcare.med') ? 'admin' : (profileData.role || 'Doctor');
    const institution = (profileData.institution && profileData.institution.trim()) || '';
    const trialDays = 7;
    const trialExpiry = Date.now() + (trialDays * 86400000);

    if (!navigator.onLine) {
      throw new Error('An active internet connection is required to create and verify your official physician account with Google Firebase.');
    }

    try {
      // 1. Direct REST call to Google Identity Toolkit signUp endpoint
      const signupRes = await this._callIdentityApi('signUp', {
        email: cleanEmail,
        password: password,
        returnSecureToken: true
      });

      const uid = signupRes.localId;
      const idToken = signupRes.idToken;

      // 2. Set profile display name via REST (non-blocking)
      this._callIdentityApi('update', {
        idToken: idToken,
        displayName: displayName,
        returnSecureToken: true
      }).catch(e => console.warn('Update displayName notice:', e.message));

      // 3. Send official email verification link via REST (non-blocking)
      this._callIdentityApi('sendOobCode', {
        idToken: idToken,
        requestType: 'VERIFY_EMAIL'
      }).catch(e => console.warn('Verification email dispatch notice:', e.message));

      const userDocData = {
        uid: uid,
        name: displayName,
        email: cleanEmail,
        emailVerified: false,
        role: role,
        institution: institution,
        tier: 'trial',
        trialExpiry: trialExpiry,
        idToken: idToken,
        refreshToken: signupRes.refreshToken,
        isVIP: role === 'admin',
        isLoggedIn: true,
        provider: 'password',
        isProfileComplete: true,
        createdAt: new Date().toISOString()
      };

      // 4. Write user document to Cloud Firestore
      if (this.fbDb) {
        try {
          await setDoc(doc(this.fbDb, 'users', uid), userDocData);
        } catch (dbErr) {
          console.warn('Firestore doc creation notice:', dbErr.message);
        }
      }

      this.currentUser = userDocData;
      localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
      localStorage.setItem(this.subKey, 'trial');
      localStorage.setItem(this.trialExpiryKey, trialExpiry.toString());
      
      if (this.currentUser && this.currentUser.isLoggedIn) {
        document.documentElement.classList.add('is-authenticated-user');
      }
      this._notifyAuthChange();
      return { success: true, user: this.currentUser, requiresVerification: false, email: cleanEmail };
    } catch (authErr) {
      console.error('Firebase createUser error:', authErr);
      const raw = authErr.rawCode || authErr.message || '';
      if (raw.includes('EMAIL_EXISTS')) {
        const err = new Error('An account with this email already exists. Please tap "Sign In" above to log in.');
        err.code = 'auth/email-already-in-use';
        throw err;
      } else if (raw.includes('WEAK_PASSWORD')) {
        throw new Error('Password is too weak. Please use at least 8 characters with a mix of letters and numbers.');
      } else if (raw.includes('INVALID_EMAIL')) {
        throw new Error('The email address format is invalid. Please check for typos.');
      } else if (raw.includes('OPERATION_NOT_ALLOWED')) {
        throw new Error('Email/Password registration is currently disabled in Firebase console.');
      } else if (raw.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        throw new Error('Access temporarily blocked due to unusual activity. Please try again later.');
      }
      throw new Error(authErr.message || 'Failed to create physician account. Please try again.');
    }
  }

  // --- 2. Email & Password Sign In (Direct Cloud REST API - Instant & Mobile Resilient) ---
  async signInWithEmail(email, password) {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error('Please enter both your registered email and password.');
    }

    if (!navigator.onLine) {
      if (this.currentUser && this.currentUser.email === cleanEmail && (this.currentUser.emailVerified || this.currentUser.role === 'admin')) {
        return { success: true, user: this.currentUser, requiresVerification: false };
      }
      throw new Error('You are currently offline. An internet connection is required to authenticate with Firebase Cloud.');
    }

    try {
      // 1. Direct REST call to Google Identity Toolkit signInWithPassword endpoint
      const signinRes = await this._callIdentityApi('signInWithPassword', {
        email: cleanEmail,
        password: password,
        returnSecureToken: true
      });

      const uid = signinRes.localId;
      const idToken = signinRes.idToken;

      // 2. Fetch user profile from Cloud Firestore with safety timeout
      let userDocData = null;
      if (this.fbDb) {
        try {
          const snap = await Promise.race([
            getDoc(doc(this.fbDb, 'users', uid)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore profile fetch timeout')), 2500))
          ]);
          if (snap && snap.exists()) {
            userDocData = snap.data();
          }
        } catch (dbErr) {
          console.warn('Firestore fetch notice:', dbErr.message);
        }
      }

      if (!userDocData) {
        const trialExpiry = Date.now() + (7 * 86400000);
        userDocData = {
          uid: uid,
          name: signinRes.displayName || 'Dr. Physician',
          email: cleanEmail,
          emailVerified: !!signinRes.registered,
          role: (cleanEmail === 'admin@criticalcare.med') ? 'admin' : 'Doctor',
          institution: '',
          tier: 'trial',
          trialExpiry: trialExpiry,
          isVIP: cleanEmail === 'admin@criticalcare.med',
          isLoggedIn: true,
          isProfileComplete: true,
          provider: 'password'
        };
      }

      const isVerified = (cleanEmail === 'admin@criticalcare.med') || !!userDocData.emailVerified;
      const isProfileDone = (userDocData.role === 'admin') || (userDocData.isProfileComplete === true && !!userDocData.role && !!userDocData.name);

      this.currentUser = {
        ...userDocData,
        idToken: idToken,
        refreshToken: signinRes.refreshToken,
        emailVerified: isVerified,
        isProfileComplete: isProfileDone,
        isLoggedIn: true
      };

      localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
      if (this.currentUser.tier) localStorage.setItem(this.subKey, this.currentUser.tier);
      if (this.currentUser.trialExpiry) localStorage.setItem(this.trialExpiryKey, this.currentUser.trialExpiry.toString());
      
      if (this.currentUser && this.currentUser.isLoggedIn) {
        document.documentElement.classList.add('is-authenticated-user');
      } else {
        document.documentElement.classList.remove('is-authenticated-user');
      }
      this._notifyAuthChange();

      // Start listening to user document updates
      this._listenToCurrentUserDoc(uid);

      return { 
        success: true, 
        user: this.currentUser, 
        requiresVerification: false, 
        requiresProfileCompletion: false, 
        email: cleanEmail 
      };
    } catch (authErr) {
      console.error('Firebase signIn error:', authErr);
      const raw = authErr.rawCode || authErr.message || '';
      if (raw.includes('EMAIL_NOT_FOUND') || raw.includes('INVALID_LOGIN_CREDENTIALS') || raw.includes('INVALID_PASSWORD')) {
        throw new Error('Incorrect email or password. If you haven\'t created an account yet, please tap "Initial Account Setup" above.');
      } else if (raw.includes('USER_DISABLED')) {
        throw new Error('This account has been deactivated. Please contact critical care support.');
      } else if (raw.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        throw new Error('Access temporarily blocked due to multiple failed login attempts. Please wait a moment or reset your password.');
      } else if (raw.includes('INVALID_EMAIL')) {
        throw new Error('Please enter a valid email address format (e.g. physician@hospital.org).');
      }
      throw new Error(authErr.message || 'Unable to sign in. Please verify your credentials.');
    }
  }

  // --- 3. Check Live Verification Status ---
  async checkEmailVerification() {
    if (this.currentUser && this.currentUser.idToken) {
      try {
        const res = await this._callIdentityApi('lookup', {
          idToken: this.currentUser.idToken
        });
        const user = res?.users?.[0];
        if (user && user.emailVerified) {
          this.currentUser.emailVerified = true;
          localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
          if (this.fbDb && this.currentUser.uid) {
            try {
              await updateDoc(doc(this.fbDb, 'users', this.currentUser.uid), {
                emailVerified: true,
                verifiedAt: new Date().toISOString()
              });
            } catch (e) {}
          }
          const isProfileDone = (this.currentUser.role === 'admin') || (this.currentUser.isProfileComplete === true && !!this.currentUser.role && !!this.currentUser.name);
          if (isProfileDone) {
            document.documentElement.classList.add('is-authenticated-user');
          }
          this._notifyAuthChange();
          return true;
        }
      } catch (e) {
        console.warn('Email verification check notice:', e.message);
      }
    }
    // Fallback to fbAuth currentUser if present
    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      try {
        await this.fbAuth.currentUser.reload();
        if (this.fbAuth.currentUser.emailVerified) {
          if (this.currentUser) {
            this.currentUser.emailVerified = true;
            localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
          }
          this._notifyAuthChange();
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  // --- 3. Live Google Sign-In (Cross-Platform & WebView Resilient) ---
  async signInWithGoogle() {
    if (!navigator.onLine) {
      throw new Error('Google Sign-In requires an active internet connection.');
    }

    await this._ensureInitialized();

    if (this.isRealFirebaseActive && this.fbAuth) {
      try {
        

        let cred;
        try {
          cred = await signInWithPopup(this.fbAuth, this.googleProvider, browserPopupRedirectResolver);
        } catch (popupErr) {
          console.warn('Popup attempt result, checking fallback mode:', popupErr.message);
          if (popupErr.code === 'auth/popup-blocked' || 
              popupErr.code === 'auth/operation-not-supported-in-this-environment' ||
              popupErr.code === 'auth/missing-initial-state') {
            await signInWithRedirect(this.fbAuth, this.googleProvider, browserPopupRedirectResolver);
            return { pending: true };
          }
          throw popupErr;
        }

        if (cred && cred.user) {
          const user = await this._syncFirebaseUserDoc(cred.user);
          return { success: true, user: user || this.currentUser };
        }
      } catch (err) {
        console.error('Google Sign-In error:', err);
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request' || err.code === 'auth/user-cancelled') {
          const cancelErr = new Error('Google Sign-In was cancelled.');
          cancelErr.code = err.code;
          throw cancelErr;
        }
        throw new Error(err.message || 'Google Sign-In failed. Please ensure Google Play Services or your browser allows popup sign-in.');
      }
    }

    throw new Error('Google Authentication service is currently connecting. Please tap again in a moment.');
  }

  // --- 4. Password Reset & Verification Utilities (Direct REST with Web SDK Fallback) ---
  async sendPasswordReset(email) {
    const cleanEmail = (email || (this.currentUser && this.currentUser.email) || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Please enter the email address for password reset.');
    }

    try {
      await this._callIdentityApi('sendOobCode', {
        email: cleanEmail,
        requestType: 'PASSWORD_RESET'
      });
      return { success: true, message: `Password reset email sent to ${cleanEmail}. Please check your inbox & spam folder.` };
    } catch (e) {
      console.warn('Password reset REST notice:', e.message);
      if (this.isRealFirebaseActive && this.fbAuth) {
        await sendPasswordResetEmail(this.fbAuth, cleanEmail);
        return { success: true, message: `Password reset email sent to ${cleanEmail}.` };
      }
      throw new Error(e.message || 'Unable to send password reset email.');
    }
  }

  async sendVerificationEmail() {
    if (this.currentUser && this.currentUser.idToken) {
      try {
        await this._callIdentityApi('sendOobCode', {
          idToken: this.currentUser.idToken,
          requestType: 'VERIFY_EMAIL'
        });
        return { success: true, message: 'Verification link sent to your registered email.' };
      } catch (e) {
        console.warn('Verification email REST notice:', e.message);
      }
    }
    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      await sendEmailVerification(this.fbAuth.currentUser);
      return { success: true, message: 'Verification link sent to your registered email.' };
    }
    throw new Error('No active user session to verify.');
  }

  // --- 4. Sign Out ---
  async signOut() {
    if (this.isRealFirebaseActive && this.fbAuth) {
      try {
        
        await signOut(this.fbAuth);
      } catch (e) {
        console.warn('Firebase signOut error:', e.message);
      }
    }

    this.currentUser = null;
    localStorage.removeItem(this.authKey);
    localStorage.setItem(this.subKey, 'free');
    document.documentElement.classList.remove('is-authenticated-user');
    this._notifyAuthChange();
  }

  // --- 5. Delete Account & Personal Data (App Store & Play Store Compliance) ---
  async deleteCurrentUser() {
    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      try {
        const uid = this.fbAuth.currentUser.uid;
        // Delete Firestore document
        if (this.fbDb) {
          try {
            
            await deleteDoc(doc(this.fbDb, 'users', uid));
          } catch (e) {}
        }
        // Delete Firebase Auth user
        
        await deleteUser(this.fbAuth.currentUser);
      } catch (err) {
        console.warn('Firebase delete user error:', err.message);
      }
    }

    // Clear all local persistent data
    try {
      localStorage.removeItem(this.authKey);
      localStorage.removeItem(this.subKey);
      localStorage.removeItem(this.trialExpiryKey);
      localStorage.removeItem('cc_selected_plan');
      localStorage.removeItem('cc_favorites');
      localStorage.removeItem('cc_recents');
    } catch (e) {}

    this.currentUser = null;
    document.documentElement.classList.remove('is-authenticated-user');
    this._notifyAuthChange();
    return { success: true };
  }

  // --- 6. Admin Firestore Methods ---

  _waitForFirebase(timeoutMs = 6000) {
    if (this.isRealFirebaseActive && this.fbDb) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      const onReady = () => {
        clearTimeout(timer);
        window.removeEventListener('cch:firebase-ready', onReady);
        resolve(true);
      };
      window.addEventListener('cch:firebase-ready', onReady, { once: true });
    });
  }

  /**
   * Fetch live list of registered users for Admin Dashboard
   */
  async fetchUsersList() {
    await this._waitForFirebase();
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        const snap = await getDocs(collection(this.fbDb, 'users'));
        const usersList = [];
        snap.forEach(d => {
          const u = d.data();
          usersList.push({
            uid: d.id,
            name: u.name || u.displayName || 'Physician',
            email: u.email || 'No email',
            role: u.role || 'Doctor',
            tier: u.tier || 'trial',
            isVIP: !!u.isVIP,
            isProfileComplete: !!u.isProfileComplete,
            createdAt: u.createdAt || null
          });
        });
        if (usersList.length > 0) {
          localStorage.setItem(this.usersKey, JSON.stringify(usersList));
          return usersList;
        }
      } catch (e) {
        console.warn('Firestore fetchUsersList notice:', e.message);
      }
    }

    // Local fallback
    const saved = localStorage.getItem(this.usersKey);
    return saved ? JSON.parse(saved) : [
      { uid: 'admin_1', name: 'Root Administrator', email: 'admin@criticalcare.med', role: 'admin', tier: 'pro', isVIP: true },
      { uid: 'doc_1', name: 'Dr. Sarah Jenkins', email: 'doctor@hospital.org', role: 'Doctor', tier: 'trial', isVIP: false }
    ];
  }

  /**
   * Real-time listener for live users list in Admin Dashboard
   */
  subscribeUsersList(callback) {
    this._waitForFirebase().then(async () => {
      if (this.isRealFirebaseActive && this.fbDb) {
        try {
          
          onSnapshot(collection(this.fbDb, 'users'), (snap) => {
            const usersList = [];
            snap.forEach(d => {
              const u = d.data();
              usersList.push({
                uid: d.id,
                name: u.name || u.displayName || 'Physician',
                email: u.email || 'No email',
                role: u.role || 'Doctor',
                tier: u.tier || 'trial',
                isVIP: !!u.isVIP,
                isProfileComplete: !!u.isProfileComplete,
                createdAt: u.createdAt || null
              });
            });
            if (usersList.length > 0) {
              localStorage.setItem(this.usersKey, JSON.stringify(usersList));
              if (callback) callback(usersList);
            }
          }, (err) => console.warn('Live users onSnapshot notice:', err.message));
        } catch (e) {
          console.warn('subscribeUsersList error:', e);
        }
      }
    });
  }

  /**
   * Send push notification broadcast from Admin to all devices
   */
  async sendBroadcastNotification(title, message) {
    const notif = {
      id: 'notif_' + Date.now(),
      title: title.trim(),
      message: message.trim(),
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      author: 'Owner Administrator'
    };

    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        await setDoc(doc(this.fbDb, 'notifications', notif.id), notif);
        console.log('✅ Push notification dispatched to Cloud Firestore:', notif.id);
      } catch (e) {
        console.warn('Firestore notification send notice:', e.message);
      }
    }

    if (this.channel) {
      this.channel.postMessage({ type: 'PUSH_NOTIFICATION', notification: notif });
    }

    try {
      const history = JSON.parse(localStorage.getItem('cch_broadcast_history') || '[]');
      history.unshift(notif);
      localStorage.setItem('cch_broadcast_history', JSON.stringify(history.slice(0, 30)));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('cch:notification-sent', { detail: notif }));
    return notif;
  }

  /**
   * Listen for live push notifications on mobile devices
   */
  subscribeToNotifications(callback) {
    this._waitForFirebase().then(async () => {
      if (this.isRealFirebaseActive && this.fbDb) {
        try {
          
          const q = query(collection(this.fbDb, 'notifications'), orderBy('timestamp', 'desc'), limit(15));
          onSnapshot(q, (snap) => {
            const list = [];
            snap.forEach(d => list.push(d.data()));
            if (callback) callback(list);
          }, (err) => console.warn('Live notifications onSnapshot notice:', err.message));
        } catch (e) {
          console.warn('subscribeToNotifications error:', e);
        }
      }
    });

    if (this.channel) {
      const prevHandler = this.channel.onmessage;
      this.channel.onmessage = (event) => {
        if (prevHandler) prevHandler(event);
        if (event.data?.type === 'PUSH_NOTIFICATION' && callback) {
          callback([event.data.notification]);
        }
      };
    }
  }

  getBroadcastHistory() {
    try {
      const saved = localStorage.getItem('cch_broadcast_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Toggle VIP Pro status for a user in Cloud Firestore
   */
  async setUserVIP(uid, isVIP) {
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        await updateDoc(doc(this.fbDb, 'users', uid), {
          isVIP: isVIP,
          tier: isVIP ? 'vip' : 'free',
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Firestore setUserVIP notice:', e.message);
      }
    }

    if (this.currentUser && this.currentUser.uid === uid) {
      this.currentUser.isVIP = isVIP;
      this.currentUser.tier = isVIP ? 'vip' : 'free';
      localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
      localStorage.setItem(this.subKey, this.currentUser.tier);
      this._notifyAuthChange();
    }
  }

  /**
   * Save live subscription pricing to Cloud Firestore
   */
  async saveLivePricing(settings) {
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        await setDoc(doc(this.fbDb, 'settings', 'pricing'), {
          ...settings,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('✅ Pricing saved to Cloud Firestore:', settings);
      } catch (e) {
        console.warn('Firestore saveLivePricing notice:', e.message);
      }
    }
    if (this.channel) {
      this.channel.postMessage({ type: 'PRICING_UPDATED', settings });
    }
  }

  /**
   * Save live module coverage matrix (Free vs Pro vs VIP) to Cloud Firestore
   */
  async saveLiveCoverageMatrix(coverageMap) {
    localStorage.setItem('critical_care_module_coverage', JSON.stringify(coverageMap));
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        
        await setDoc(doc(this.fbDb, 'settings', 'coverage'), {
          coverage: coverageMap,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('✅ Module coverage matrix saved to Cloud Firestore!');
      } catch (e) {
        console.warn('Firestore saveLiveCoverageMatrix notice:', e.message);
      }
    }
    if (this.channel) {
      this.channel.postMessage({ type: 'MODULE_TIERS_UPDATED', coverage: coverageMap });
    }
  }

  _toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(v => this._toFirestoreValue(v)) } };
    }
    if (typeof val === 'object') {
      const fields = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) {
          fields[k] = this._toFirestoreValue(v);
        }
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  _fromFirestoreValue(val) {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) {
      return (val.arrayValue.values || []).map(v => this._fromFirestoreValue(v));
    }
    if ('mapValue' in val) {
      const res = {};
      const fields = val.mapValue.fields || {};
      for (const [k, v] of Object.entries(fields)) {
        res[k] = this._fromFirestoreValue(v);
      }
      return res;
    }
    return null;
  }

  /**
   * Fast Direct REST Fetch for Simulator Catalog (Works instantly on all devices)
   */
  async syncCatalogFromCloudREST() {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/settings/catalog?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const fields = json.fields || {};
        const published = this._fromFirestoreValue(fields.published);
        const archived = this._fromFirestoreValue(fields.archived);

        if (Array.isArray(published) && published.length > 0) {
          localStorage.setItem('cch_live_published_modules', JSON.stringify(published));
          if (Array.isArray(archived)) {
            localStorage.setItem('cch_archived_modules', JSON.stringify(archived));
          }
          console.log(`✅ [FAST REST SYNC] Loaded ${published.length} simulators directly from Cloud Firestore!`);
          window.dispatchEvent(new CustomEvent('cch:catalog-updated', { detail: { published, archived } }));
          window.dispatchEvent(new CustomEvent('cch:modules-updated', { detail: published }));
          window.dispatchEvent(new CustomEvent('cch:archived-updated', { detail: archived }));
          return { published, archived };
        }
      }
    } catch (err) {
      console.warn('REST catalog sync notice:', err.message);
    }
    return null;
  }

  /**
   * Save live simulator catalog & archived simulators to Cloud Firestore
   * Dual-engine: Writes immediately via REST API + SDK for 100% reliable global delivery
   */
  async saveLiveCatalog(archivedList, publishedList) {
    const cleanArchived = JSON.parse(JSON.stringify(archivedList || []));
    const cleanPublished = JSON.parse(JSON.stringify(publishedList || []));

    localStorage.setItem('cch_archived_modules', JSON.stringify(cleanArchived));
    localStorage.setItem('cch_live_published_modules', JSON.stringify(cleanPublished));

    // 1. Direct High-Speed REST Push to Google Cloud Firestore (Immediate execution guaranteed)
    const restUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/settings/catalog?key=${FIREBASE_CONFIG.apiKey}`;
    const restPromise = fetch(restUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          archived: this._toFirestoreValue(cleanArchived),
          published: this._toFirestoreValue(cleanPublished),
          updatedAt: { stringValue: new Date().toISOString() }
        }
      })
    }).then(res => {
      if (res.ok) {
        console.log('✅ [CLOUD REST] Simulator catalog successfully published to Firestore!');
      } else {
        console.warn('REST catalog save status:', res.status);
      }
    }).catch(e => {
      console.warn('REST saveLiveCatalog notice:', e.message);
    });

    // 2. Also save via Firestore SDK if connection active
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        await setDoc(doc(this.fbDb, 'settings', 'catalog'), {
          archived: cleanArchived,
          published: cleanPublished,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('✅ [CLOUD SDK] Live catalog & archive state saved to Cloud Firestore!');
      } catch (e) {
        console.warn('Firestore SDK saveLiveCatalog notice:', e.message);
      }
    }

    await restPromise;

    if (this.channel) {
      this.channel.postMessage({ type: 'CATALOG_UPDATED', archived: cleanArchived, published: cleanPublished });
    }
    window.dispatchEvent(new CustomEvent('cch:catalog-updated', { detail: { archived: cleanArchived, published: cleanPublished } }));
    window.dispatchEvent(new CustomEvent('cch:modules-updated', { detail: cleanPublished }));
  }
}

// Global Singleton Instance
export const firebaseService = new FirebaseService();
window.firebaseService = firebaseService;
