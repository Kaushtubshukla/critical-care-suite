package com.criticalcare.med;

import android.os.Bundle;
import android.os.Message;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.Dialog;
import android.view.ViewGroup;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
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

