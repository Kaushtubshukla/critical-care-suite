package com.criticalcare.med;

import android.os.Bundle;
import android.os.Message;
import android.content.Intent;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.Dialog;
import android.view.ViewGroup;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

public class MainActivity extends BridgeActivity {
    private static final int RC_SIGN_IN = 9001;
    private static final String WEB_CLIENT_ID = "617853293846-3tnpo8qhg4q2hpd65d8kck9bedsb7aqv.apps.googleusercontent.com";
    private GoogleSignInClient mGoogleSignInClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Initialize Native Google Play Services Sign-In Client
        try {
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(WEB_CLIENT_ID)
                .requestEmail()
                .build();
            mGoogleSignInClient = GoogleSignIn.getClient(this, gso);
        } catch (Exception e) {
            e.printStackTrace();
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            
            // Enable local DOM & database persistence for offline and OAuth
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportMultipleWindows(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            
            // Sanitize User-Agent to standard Chrome Mobile to comply with Google OAuth policies
            String rawUa = settings.getUserAgentString();
            if (rawUa != null) {
                String cleanUa = rawUa.replace("; wv", "").replaceAll("Version\\/\\d+\\.\\d+\\s*", "");
                settings.setUserAgentString(cleanUa);
            }
            
            // Enable third-party cookies for OAuth redirects
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);

            // Register Native Google Sign-In Javascript Bridge Interface
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void launchGoogleSignIn() {
                    runOnUiThread(() -> {
                        if (mGoogleSignInClient != null) {
                            mGoogleSignInClient.signOut().addOnCompleteListener(MainActivity.this, task -> {
                                Intent signInIntent = mGoogleSignInClient.getSignInIntent();
                                startActivityForResult(signInIntent, RC_SIGN_IN);
                            });
                        }
                    });
                }

                @JavascriptInterface
                public void exitApp() {
                    runOnUiThread(() -> {
                        MainActivity.this.finishAffinity();
                    });
                }

                @JavascriptInterface
                public boolean isAvailable() {
                    return true;
                }
            }, "AndroidNativeGoogleAuth");

            // Handle multi-window popups (Google Auth dialogs) while preserving Capacitor's BridgeWebChromeClient
            webView.setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    WebView popupWebView = new WebView(MainActivity.this);
                    WebSettings popupSettings = popupWebView.getSettings();
                    popupSettings.setJavaScriptEnabled(true);
                    popupSettings.setDomStorageEnabled(true);
                    popupSettings.setDatabaseEnabled(true);
                    popupSettings.setSupportMultipleWindows(true);
                    popupSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                    
                    // Match the sanitized Chrome User-Agent in the popup
                    String popupRawUa = popupSettings.getUserAgentString();
                    if (popupRawUa != null) {
                        String cleanPopupUa = popupRawUa.replace("; wv", "").replaceAll("Version\\/\\d+\\.\\d+\\s*", "");
                        popupSettings.setUserAgentString(cleanPopupUa);
                    }
                    
                    CookieManager.getInstance().setAcceptCookie(true);
                    CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

                    Dialog dialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar_Fullscreen);
                    dialog.setContentView(popupWebView);
                    dialog.setOnCancelListener(d -> {
                        try {
                            popupWebView.destroy();
                        } catch (Exception ignored) {}
                    });
                    dialog.show();

                    popupWebView.setWebChromeClient(new WebChromeClient() {
                        @Override
                        public void onCloseWindow(WebView window) {
                            try {
                                dialog.dismiss();
                                window.destroy();
                            } catch (Exception ignored) {}
                        }
                    });

                    popupWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, String url) {
                            return false;
                        }
                    });

                    WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                    transport.setWebView(popupWebView);
                    resultMsg.sendToTarget();
                    return true;
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == RC_SIGN_IN) {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            try {
                GoogleSignInAccount account = task.getResult(ApiException.class);
                if (account != null && account.getIdToken() != null) {
                    String idToken = account.getIdToken();
                    String email = account.getEmail() != null ? account.getEmail() : "";
                    String displayName = account.getDisplayName() != null ? account.getDisplayName() : "";
                    runOnUiThread(() -> {
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            String js = String.format(
                                "window.dispatchEvent(new CustomEvent('cch:native-google-success', { detail: { idToken: '%s', email: '%s', displayName: '%s' } }));",
                                idToken, email.replace("'", "\\'"), displayName.replace("'", "\\'")
                            );
                            getBridge().getWebView().evaluateJavascript(js, null);
                        }
                    });
                } else {
                    sendNativeError("No ID token returned by Google Play Services");
                }
            } catch (ApiException e) {
                String errorMsg = "Google Sign-In failed (" + e.getStatusCode() + ")";
                if (e.getStatusCode() == 12501 || e.getStatusCode() == 12502) {
                    errorMsg = "Google Sign-In was cancelled";
                } else if (e.getStatusCode() == 10) {
                    errorMsg = "Developer error (Code 10). Please verify SHA-1 fingerprint in Firebase Console.";
                }
                final String finalMsg = errorMsg;
                final int code = e.getStatusCode();
                runOnUiThread(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = String.format(
                            "window.dispatchEvent(new CustomEvent('cch:native-google-error', { detail: { message: '%s', statusCode: %d } }));",
                            finalMsg.replace("'", "\\'"), code
                        );
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                });
            }
        }
    }

    private void sendNativeError(String msg) {
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String js = String.format(
                    "window.dispatchEvent(new CustomEvent('cch:native-google-error', { detail: { message: '%s' } }));",
                    msg.replace("'", "\\'")
                );
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "if (window.handleHardwareBack) { window.handleHardwareBack(); } else { window.history.back(); }",
                null
            );
        } else {
            super.onBackPressed();
        }
    }
}


