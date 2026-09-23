/**
 * Google Firebase Production Client Service for Critical Care Hub
 * Provides Live Authentication (Email/Password & Google Sign-In), Cloud Firestore Sync,
 * Physician Profile & Role Management, Multi-tab BroadcastChannel, and Resilient Offline Fallback.
 */

import { FIREBASE_CONFIG, USE_REAL_FIREBASE } from './firebase-config.js';

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
    if (this._initPromise) {
      try {
        await Promise.race([
          this._initPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase init timeout')), 5000))
        ]);
      } catch (e) {
        console.warn('Firebase init wait notice:', e);
      }
    }
  }

  // --- Real Google Firebase Cloud Initialization ---
  async _initRealFirebase() {
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { 
        getAuth, 
        initializeAuth,
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserPopupRedirectResolver,
        onAuthStateChanged, 
        GoogleAuthProvider,
        getRedirectResult
      } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      const { 
        getFirestore, 
        doc, 
        getDoc, 
        setDoc,
        onSnapshot,
        enableIndexedDbPersistence
      } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      this.fbApp = initializeApp(FIREBASE_CONFIG);
      
      // Initialize Auth with IndexedDB + LocalStorage persistence and browser popup/redirect resolver
      try {
        this.fbAuth = initializeAuth(this.fbApp, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
          popupRedirectResolver: browserPopupRedirectResolver
        });
      } catch (authInitErr) {
        this.fbAuth = getAuth(this.fbApp);
      }

      this.fbDb = getFirestore(this.fbApp);
      
      // Enable Firestore offline persistence
      try {
        await enableIndexedDbPersistence(this.fbDb);
      } catch (dbPersistErr) {
        console.warn('Firestore offline persistence notice:', dbPersistErr.message);
      }

      this.googleProvider = new GoogleAuthProvider();
      this.googleProvider.setCustomParameters({ prompt: 'select_account' });
      this.isRealFirebaseActive = true;

      console.log('✅ Connected to live Google Firebase Cloud:', FIREBASE_CONFIG.projectId);

      // Handle redirect result if signInWithRedirect was used
      try {
        const redirectRes = await getRedirectResult(this.fbAuth, browserPopupRedirectResolver);
        if (redirectRes && redirectRes.user) {
          await this._syncFirebaseUserDoc(redirectRes.user);
        }
      } catch (redirErr) {
        console.warn('Firebase redirect result notice:', redirErr.message);
      }

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
        const { collection, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
      const { doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
      
      if (isVerified && isProfileDone) {
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
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(({ doc, onSnapshot }) => {
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
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
        const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
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
        const isVerified = this.currentUser && (this.currentUser.emailVerified || this.currentUser.role === 'admin' || (this.currentUser.email && this.currentUser.email.toLowerCase() === 'admin@criticalcare.med'));
        const isProfileDone = this.currentUser && ((this.currentUser.role === 'admin') || (this.currentUser.isProfileComplete === true && !!this.currentUser.role && !!this.currentUser.name));

        if (this.currentUser && this.currentUser.isLoggedIn && isVerified && isProfileDone) {
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

  // --- 1. Email & Password Sign Up (Industry Authenticity & Verification Enforcement) ---
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

    await this._ensureInitialized();

    if (!navigator.onLine && (!this.isRealFirebaseActive || !this.fbAuth)) {
      throw new Error('An active internet connection is required to create and verify your official physician account with Google Firebase.');
    }

    if (this.isRealFirebaseActive && this.fbAuth) {
      try {
        const { 
          createUserWithEmailAndPassword, 
          updateProfile,
          sendEmailVerification
        } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

        const cred = await createUserWithEmailAndPassword(this.fbAuth, cleanEmail, password);
        const fbUser = cred.user;

        // Set display name in Firebase Auth
        try {
          await updateProfile(fbUser, { displayName: displayName });
        } catch (e) {}

        // Send official verification email
        try {
          await sendEmailVerification(fbUser);
        } catch (evErr) {
          console.warn('Verification email dispatch notice:', evErr.message);
        }

        const userDocData = {
          uid: fbUser.uid,
          name: displayName,
          email: cleanEmail,
          emailVerified: false,
          role: role,
          institution: institution,
          tier: 'trial',
          trialExpiry: trialExpiry,
          isVIP: role === 'admin',
          isLoggedIn: true,
          provider: 'password',
          isProfileComplete: true,
          createdAt: new Date().toISOString()
        };

        // Write user document to Cloud Firestore
        try {
          if (this.fbDb) {
            await setDoc(doc(this.fbDb, 'users', fbUser.uid), userDocData);
          }
        } catch (dbErr) {
          console.warn('Firestore doc creation notice:', dbErr.message);
        }

        this.currentUser = userDocData;
        localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
        localStorage.setItem(this.subKey, 'trial');
        localStorage.setItem(this.trialExpiryKey, trialExpiry.toString());
        
        // Gatekeeper barrier remains ACTIVE until verified
        document.documentElement.classList.remove('is-authenticated-user');
        this._notifyAuthChange();
        return { success: true, user: this.currentUser, requiresVerification: true, email: cleanEmail };
      } catch (authErr) {
        console.error('Firebase createUser error:', authErr);
        if (authErr.code === 'auth/email-already-in-use') {
          try {
            const signInRes = await this.signInWithEmail(cleanEmail, password);
            return signInRes;
          } catch (signInErr) {
            throw new Error('An account with this email already exists. Please tap "Sign In" above to log in.');
          }
        } else if (authErr.code === 'auth/weak-password') {
          throw new Error('Password is too weak. Please use at least 8 characters with a mix of letters and numbers.');
        } else if (authErr.code === 'auth/invalid-email') {
          throw new Error('The email address format is invalid. Please check for typos.');
        } else if (authErr.code === 'auth/network-request-failed') {
          throw new Error('Unable to connect to Firebase Cloud. Please check your internet connection.');
        } else if (authErr.code === 'auth/operation-not-allowed') {
          throw new Error('Email/Password registration is currently disabled in Firebase console.');
        }
        throw new Error(authErr.message || 'Failed to create physician account. Please try again.');
      }
    }

    throw new Error('Firebase Authentication is initializing. Please tap again in a moment.');
  }

  // --- 2. Email & Password Sign In ---
  async signInWithEmail(email, password) {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error('Please enter both your registered email and password.');
    }

    await this._ensureInitialized();

    if (!navigator.onLine && (!this.isRealFirebaseActive || !this.fbAuth)) {
      if (this.currentUser && this.currentUser.email === cleanEmail && (this.currentUser.emailVerified || this.currentUser.role === 'admin')) {
        return { success: true, user: this.currentUser, requiresVerification: false };
      }
      throw new Error('You are currently offline. An internet connection is required to authenticate with Firebase Cloud.');
    }

    if (this.isRealFirebaseActive && this.fbAuth) {
      try {
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

        const cred = await signInWithEmailAndPassword(this.fbAuth, cleanEmail, password);
        const fbUser = cred.user;

        // Fetch user document from Cloud Firestore
        let userDocData = null;
        try {
          if (this.fbDb) {
            const snap = await getDoc(doc(this.fbDb, 'users', fbUser.uid));
            if (snap.exists()) {
              userDocData = snap.data();
            }
          }
        } catch (dbErr) {
          console.warn('Firestore fetch notice:', dbErr.message);
        }

        if (!userDocData) {
          const trialExpiry = Date.now() + (7 * 86400000);
          userDocData = {
            uid: fbUser.uid,
            name: fbUser.displayName || 'Dr. Physician',
            email: cleanEmail,
            emailVerified: fbUser.emailVerified || false,
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

        const isVerified = fbUser.emailVerified || (cleanEmail === 'admin@criticalcare.med');
        const isProfileDone = (userDocData.role === 'admin') || (userDocData.isProfileComplete === true && !!userDocData.role && !!userDocData.name);

        this.currentUser = { ...userDocData, emailVerified: isVerified, isProfileComplete: isProfileDone, isLoggedIn: true };
        localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
        if (this.currentUser.tier) localStorage.setItem(this.subKey, this.currentUser.tier);
        if (this.currentUser.trialExpiry) localStorage.setItem(this.trialExpiryKey, this.currentUser.trialExpiry.toString());
        
        if (isVerified && isProfileDone) {
          document.documentElement.classList.add('is-authenticated-user');
        } else {
          document.documentElement.classList.remove('is-authenticated-user');
        }
        this._notifyAuthChange();
        return { 
          success: true, 
          user: this.currentUser, 
          requiresVerification: !isVerified, 
          requiresProfileCompletion: !isProfileDone, 
          email: cleanEmail 
        };
      } catch (authErr) {
        console.error('Firebase signIn error:', authErr);
        if (authErr.code === 'auth/user-not-found') {
          throw new Error('No medical account found with this email. Please tap "Initial Account Setup" above to create one.');
        } else if (authErr.code === 'auth/wrong-password') {
          throw new Error('Incorrect password. Please check your password or tap "Forgot password?" below.');
        } else if (authErr.code === 'auth/invalid-credential') {
          throw new Error('Incorrect email or password. If you haven\'t created an account yet, please tap "Initial Account Setup" above.');
        } else if (authErr.code === 'auth/invalid-email') {
          throw new Error('Please enter a valid email address format (e.g. physician@hospital.org).');
        } else if (authErr.code === 'auth/user-disabled') {
          throw new Error('This account has been deactivated. Please contact critical care support.');
        } else if (authErr.code === 'auth/too-many-requests') {
          throw new Error('Access temporarily blocked due to multiple failed login attempts. Please wait a moment or reset your password.');
        } else if (authErr.code === 'auth/network-request-failed') {
          throw new Error('Unable to connect to Firebase Cloud. Please check your internet connection.');
        }
        throw new Error(authErr.message || 'Unable to sign in. Please verify your credentials.');
      }
    }

    throw new Error('Firebase service is initializing. Please retry in a moment.');
  }

  // --- 3. Check Live Verification Status ---
  async checkEmailVerification() {
    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      await this.fbAuth.currentUser.reload();
      const isVerified = this.fbAuth.currentUser.emailVerified;
      if (isVerified) {
        if (this.currentUser) {
          this.currentUser.emailVerified = true;
          localStorage.setItem(this.authKey, JSON.stringify(this.currentUser));
          if (this.fbDb) {
            try {
              const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
              await updateDoc(doc(this.fbDb, 'users', this.fbAuth.currentUser.uid), {
                emailVerified: true,
                verifiedAt: new Date().toISOString()
              });
            } catch (e) {}
          }
        }
        const isProfileDone = (this.currentUser.role === 'admin') || (this.currentUser.isProfileComplete === true && !!this.currentUser.role && !!this.currentUser.name);
        if (isProfileDone) {
          document.documentElement.classList.add('is-authenticated-user');
        } else {
          document.documentElement.classList.remove('is-authenticated-user');
        }
        this._notifyAuthChange();
        return true;
      }
      return false;
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
        const { 
          signInWithPopup, 
          signInWithRedirect,
          browserPopupRedirectResolver
        } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

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
        if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('Google Sign-In was cancelled.');
        } else if (err.code === 'auth/cancelled-popup-request') {
          throw new Error('Another sign-in request is already in progress.');
        }
        throw new Error(err.message || 'Google Sign-In failed. Please ensure Google Play Services or your browser allows popup sign-in.');
      }
    }

    throw new Error('Google Authentication service is currently connecting. Please tap again in a moment.');
  }

  // --- 4. Password Reset & Verification Utilities ---
  async sendPasswordReset(email) {
    const cleanEmail = (email || (this.currentUser && this.currentUser.email) || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Please enter the email address for password reset.');
    }

    if (this.isRealFirebaseActive && this.fbAuth) {
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await sendPasswordResetEmail(this.fbAuth, cleanEmail);
      return { success: true, message: `Password reset email sent to ${cleanEmail}.` };
    }
    throw new Error('Unable to contact Firebase Auth server.');
  }

  async sendVerificationEmail() {
    if (this.isRealFirebaseActive && this.fbAuth && this.fbAuth.currentUser) {
      const { sendEmailVerification } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await sendEmailVerification(this.fbAuth.currentUser);
      return { success: true, message: 'Verification link sent to your registered email.' };
    }
    throw new Error('No active user session to verify.');
  }

  // --- 4. Sign Out ---
  async signOut() {
    if (this.isRealFirebaseActive && this.fbAuth) {
      try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
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
            const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            await deleteDoc(doc(this.fbDb, 'users', uid));
          } catch (e) {}
        }
        // Delete Firebase Auth user
        const { deleteUser } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
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
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
          const { collection, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
          const { collection, query, orderBy, limit, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
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

  /**
   * Save live simulator catalog & archived simulators to Cloud Firestore
   */
  async saveLiveCatalog(archivedList, publishedList) {
    localStorage.setItem('cch_archived_modules', JSON.stringify(archivedList));
    localStorage.setItem('cch_live_published_modules', JSON.stringify(publishedList));
    if (this.isRealFirebaseActive && this.fbDb) {
      try {
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        await setDoc(doc(this.fbDb, 'settings', 'catalog'), {
          archived: archivedList,
          published: publishedList,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('✅ Live catalog & archive state saved to Cloud Firestore!');
      } catch (e) {
        console.warn('Firestore saveLiveCatalog notice:', e.message);
      }
    }
    if (this.channel) {
      this.channel.postMessage({ type: 'CATALOG_UPDATED', archived: archivedList, published: publishedList });
    }
    window.dispatchEvent(new CustomEvent('cch:catalog-updated', { detail: { archived: archivedList, published: publishedList } }));
  }
}

// Global Singleton Instance
export const firebaseService = new FirebaseService();
window.firebaseService = firebaseService;
