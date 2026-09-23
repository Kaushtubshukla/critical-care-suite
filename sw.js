/**
 * Critical Care Suite - Service Worker
 * Enables 100% offline hospital readiness for all clinical simulators.
 */

const CACHE_NAME = 'critical-care-cache-v2.12.1';

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app/css/mobile-shell.css',
  './app/js/app.js',
  './app/js/subscription.js',
  './app/js/disclaimer.js',
  './app/js/presentation-ctrl.js',
  './app/data/simulators.js',
  './app/js/services/firebase-service.js',
  './app/js/services/modules-service.js',
  './Hypoxic_Patient_Respiratory_Critical_Care_Simulator_v22.html',
  './COPD_vs_ARDS_Interactive_Atlas_NATIVE.html',
  './ARDS_Active_Simulator.html',
  './COPD_Asthma_V11_CASE_DRIVEN_CHECKED.html',
  './Acute_Ischemic_Stroke_Simulator_V6_FINAL.html',
  './TBI_Interactive_Simulator_v5_ICP_Anisocoria.html',
  './Intracerebral_Hemorrhage_Interactive_Simulator_v1.html',
  './Subarachnoid_Hemorrhage_Interactive_Simulator_v1.html',
  './Status_Epilepticus_Interactive_Simulator_v2_EDITABLE.html',
  './CNS_Infection_Interactive_Algorithm_v7.html',
  './ABG_Photo_Interpreter_Simulator.html',
  './Cardiac_Rhythm_Decision_Simulator_V29_FINAL_AUDITED.html',
  './Shock_Identification_Management_Simulator.html',
  './ACLS_Interactive_Simulator_2025_AHA_v1.html',
  './Hypotensive_Patient_Simulation.html',
  './hemodynamics.html',
  './tbi.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache warning for some offline assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin, admin portal, or non-GET requests (admin is always live)
  if (event.request.method !== 'GET' || !url.origin.includes(self.location.origin) || url.pathname.includes('/admin/')) {
    return;
  }

  // Network-First for HTML documents and JavaScript files to guarantee immediate updates
  if (event.request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First for static images and simulators
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
