package uk.ihni.gawkr;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

public class LoginActivity extends AppCompatActivity {
    private EditText etServerUrl;
    private EditText etUsername;
    private EditText etPassword;
    private Button btnConnect;
    private ProgressBar progressBar;
    private TextView tvError;

    private SharedPreferences prefs;
    private OkHttpClient client;
    private Handler mainHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        prefs = getSharedPreferences("gawkr_prefs", Context.MODE_PRIVATE);
        mainHandler = new Handler(Looper.getMainLooper());
        client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build();

        etServerUrl = findViewById(R.id.etServerUrl);
        etUsername = findViewById(R.id.etUsername);
        etPassword = findViewById(R.id.etPassword);
        btnConnect = findViewById(R.id.btnConnect);
        progressBar = findViewById(R.id.progressBar);
        tvError = findViewById(R.id.tvError);

        // Pre-fill existing credentials if previously saved
        String savedServer = prefs.getString("server_url", "");
        String savedUser = prefs.getString("username", "");
        String savedPassword = prefs.getString("password", "");
        String savedRole = prefs.getString("role", "admin");
        String savedToken = prefs.getString("token", "");

        if (!savedServer.isEmpty()) {
            etServerUrl.setText(savedServer);
        }
        if (!savedUser.isEmpty()) {
            etUsername.setText(savedUser);
        }
        if (!savedPassword.isEmpty()) {
            etPassword.setText(savedPassword);
        }

        // Check if intent specifies forced re-login
        boolean switchServer = getIntent().getBooleanExtra("switch_server", false);
        if (!switchServer && !savedToken.isEmpty() && !savedServer.isEmpty()) {
            launchMainActivity(savedServer, savedToken, savedUser, savedRole);
            return;
        }

        btnConnect.setOnClickListener(v -> performLogin());
    }

    private void performLogin() {
        String rawServer = etServerUrl.getText().toString().trim();
        String username = etUsername.getText().toString().trim();
        String password = etPassword.getText().toString();

        if (rawServer.isEmpty()) {
            showError("Please enter the server address");
            return;
        }
        if (username.isEmpty() || password.isEmpty()) {
            showError("Please enter both username and password");
            return;
        }

        // Normalize URL
        if (!rawServer.startsWith("http://") && !rawServer.startsWith("https://")) {
            if (rawServer.matches("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+.*") || rawServer.contains(":8000") || rawServer.contains("localhost")) {
                rawServer = "http://" + rawServer;
            } else {
                rawServer = "https://" + rawServer;
            }
        }
        if (rawServer.endsWith("/")) {
            rawServer = rawServer.substring(0, rawServer.length() - 1);
        }
        final String serverUrl = rawServer;

        setLoading(true);

        new Thread(() -> {
            try {
                JSONObject jsonBody = new JSONObject();
                jsonBody.put("username", username);
                jsonBody.put("password", password);

                RequestBody body = RequestBody.create(
                        jsonBody.toString(),
                        MediaType.parse("application/json; charset=utf-8")
                );

                Request request = new Request.Builder()
                        .url(serverUrl + "/api/auth/login")
                        .post(body)
                        .build();

                try (Response response = client.newCall(request).execute()) {
                    String respStr = response.body() != null ? response.body().string() : "";
                    
                    if (response.isSuccessful() && !respStr.isEmpty()) {
                        JSONObject respJson = new JSONObject(respStr);
                        String token = respJson.optString("token", "");
                        
                        if (!token.isEmpty()) {
                            String role = respJson.optString("role", "admin");
                            String respUsername = respJson.optString("username", username);

                            // Save credentials synchronously
                            prefs.edit()
                                    .putString("server_url", serverUrl)
                                    .putString("username", respUsername)
                                    .putString("password", password)
                                    .putString("role", role)
                                    .putString("token", token)
                                    .commit();

                            // Start background push service
                            Intent serviceIntent = new Intent(LoginActivity.this, GawkrPushService.class);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                startForegroundService(serviceIntent);
                            } else {
                                startService(serviceIntent);
                            }

                            mainHandler.post(() -> launchMainActivity(serverUrl, token, respUsername, role));
                            return;
                        }
                    }

                    mainHandler.post(() -> {
                        setLoading(false);
                        if (response.code() == 401) {
                            showError("Invalid username or password.");
                        } else {
                            showError("Server returned code " + response.code() + ": Check address.");
                        }
                    });
                }
            } catch (Exception e) {
                mainHandler.post(() -> {
                    setLoading(false);
                    showError("Connection failed: " + e.getMessage());
                });
            }
        }).start();
    }

    private void launchMainActivity(String serverUrl, String token, String username, String role) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("server_url", serverUrl);
        intent.putExtra("token", token);
        intent.putExtra("username", username);
        intent.putExtra("role", role);
        startActivity(intent);
        finish();
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnConnect.setEnabled(!loading);
        btnConnect.setAlpha(loading ? 0.6f : 1.0f);
        tvError.setVisibility(View.GONE);
    }

    private void showError(String msg) {
        tvError.setText(msg);
        tvError.setVisibility(View.VISIBLE);
    }
}
