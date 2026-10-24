package uk.ihni.gawkr;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final int PERMISSION_REQ_NOTIFICATIONS = 2001;

    private WebView webView;
    private ProgressBar webProgressBar;
    private TextView tvServerTitle;
    private View viewPushDot;
    private TextView tvPushStatus;
    private ImageButton btnSwitchServer;

    private String serverUrl;
    private String token;
    private String username;
    private String role;
    private SharedPreferences prefs;

    private final BroadcastReceiver pushReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (GawkrPushService.ACTION_STATUS_CHANGE.equals(intent.getAction())) {
                boolean connected = intent.getBooleanExtra(GawkrPushService.EXTRA_CONNECTED, false);
                updatePushStatusUI(connected);
            }
        }
    };

    public class GawkrBridge {
        @android.webkit.JavascriptInterface
        public String getAuthToken() { return token; }
        @android.webkit.JavascriptInterface
        public String getUsername() { return username; }
        @android.webkit.JavascriptInterface
        public String getRole() { return role; }
        @android.webkit.JavascriptInterface
        public boolean isAndroidApp() { return true; }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("gawkr_prefs", Context.MODE_PRIVATE);
        serverUrl = prefs.getString("server_url", "");
        token = prefs.getString("token", "");
        username = prefs.getString("username", "admin");
        role = prefs.getString("role", "admin");

        if (getIntent() != null) {
            if (getIntent().hasExtra("server_url") && getIntent().getStringExtra("server_url") != null) {
                serverUrl = getIntent().getStringExtra("server_url");
            }
            if (getIntent().hasExtra("token") && getIntent().getStringExtra("token") != null) {
                token = getIntent().getStringExtra("token");
            }
            if (getIntent().hasExtra("username") && getIntent().getStringExtra("username") != null) {
                username = getIntent().getStringExtra("username");
            }
            if (getIntent().hasExtra("role") && getIntent().getStringExtra("role") != null) {
                role = getIntent().getStringExtra("role");
            }
        }

        webView = findViewById(R.id.webView);
        webProgressBar = findViewById(R.id.webProgressBar);
        tvServerTitle = findViewById(R.id.tvServerTitle);
        viewPushDot = findViewById(R.id.viewPushDot);
        tvPushStatus = findViewById(R.id.tvPushStatus);
        btnSwitchServer = findViewById(R.id.btnSwitchServer);

        // Display host name in title bar
        try {
            java.net.URI uri = new java.net.URI(serverUrl);
            tvServerTitle.setText("GAWKR • " + uri.getHost());
        } catch (Exception e) {
            tvServerTitle.setText("GAWKR LIVE");
        }

        btnSwitchServer.setOnClickListener(v -> {
            Intent intent = new Intent(MainActivity.this, LoginActivity.class);
            intent.putExtra("switch_server", true);
            startActivity(intent);
            finish();
        });

        checkNotificationPermission();
        setupWebView();
        ensurePushServiceRunning();

        // Register push status receiver
        IntentFilter filter = new IntentFilter(GawkrPushService.ACTION_STATUS_CHANGE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pushReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pushReceiver, filter);
        }
    }

    private void updatePushStatusUI(boolean connected) {
        if (connected) {
            viewPushDot.setBackgroundColor(0xFF10B981); // Emerald
            tvPushStatus.setText("Push: Active");
            tvPushStatus.setTextColor(0xFF10B981);
        } else {
            viewPushDot.setBackgroundColor(0xFFEF4444); // Red
            tvPushStatus.setText("Push: Reconnecting");
            tvPushStatus.setTextColor(0xFFEF4444);
        }
    }

    private void ensurePushServiceRunning() {
        Intent serviceIntent = new Intent(this, GawkrPushService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    private void checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        PERMISSION_REQ_NOTIFICATIONS
                );
            }
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " GawkrAndroid/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        if (token != null && !token.isEmpty()) {
            cookieManager.setCookie(serverUrl, "nvr_token=" + token + "; Path=/; SameSite=Lax");
        }

        // Native Single Sign-On Javascript bridge
        webView.addJavascriptInterface(new GawkrBridge(), "GawkrBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    webProgressBar.setVisibility(View.VISIBLE);
                } else {
                    webProgressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            private void injectAuth(WebView view) {
                if (token != null && !token.isEmpty()) {
                    String js = "try { " +
                            "localStorage.setItem('nvr_token', '" + token + "'); " +
                            "localStorage.setItem('nvr_user', JSON.stringify({username: '" + username + "', role: '" + role + "'})); " +
                            "localStorage.setItem('token', '" + token + "'); " +
                            "localStorage.setItem('gawkr_token', '" + token + "'); " +
                            "} catch(e) {}";
                    view.evaluateJavascript(js, null);
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectAuth(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectAuth(view);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        // Load the dashboard with trailing slash and URL authentication parameters for instant SSO
        String baseUrl = serverUrl.endsWith("/") ? serverUrl : (serverUrl + "/");
        String targetUrl = baseUrl;
        if (token != null && !token.isEmpty()) {
            targetUrl += "?auth_token=" + android.net.Uri.encode(token) +
                    "&user=" + android.net.Uri.encode(username) +
                    "&role=" + android.net.Uri.encode(role);
        }
        webView.loadUrl(targetUrl);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(pushReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
