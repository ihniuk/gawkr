package uk.ihni.gawkr;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

public class GawkrPushService extends Service {
    private static final String TAG = "GawkrPushService";
    public static final String ACTION_STATUS_CHANGE = "uk.ihni.gawkr.PUSH_STATUS";
    public static final String EXTRA_CONNECTED = "extra_connected";

    private OkHttpClient client;
    private WebSocket webSocket;
    private Handler reconnectHandler;
    private boolean isDestroyed = false;
    private boolean isConnected = false;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationHelper.createChannels(this);
        reconnectHandler = new Handler(Looper.getMainLooper());
        
        client = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(20, TimeUnit.SECONDS)
                .build();

        startForeground(1001, createServiceNotification("Connecting to Gawkr…"));
        connectWebSocket();
    }

    private Notification createServiceNotification(String status) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, NotificationHelper.SERVICE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_gawkr)
                .setContentTitle(getString(R.string.service_notification_title))
                .setContentText(status)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateServiceNotification(String status) {
        try {
            Notification notification = createServiceNotification(status);
            android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
            if (nm != null) {
                nm.notify(1001, notification);
            }
        } catch (Exception ignored) {
        }
    }

    private void connectWebSocket() {
        if (isDestroyed) return;

        SharedPreferences prefs = getSharedPreferences("gawkr_prefs", Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "");
        String token = prefs.getString("token", "");

        if (serverUrl.isEmpty()) {
            Log.w(TAG, "No server URL configured for push service");
            return;
        }

        // Convert http(s) to ws(s)
        String wsUrl = serverUrl;
        if (wsUrl.startsWith("http://")) {
            wsUrl = "ws://" + wsUrl.substring(7);
        } else if (wsUrl.startsWith("https://")) {
            wsUrl = "wss://" + wsUrl.substring(8);
        }
        if (wsUrl.endsWith("/")) {
            wsUrl = wsUrl.substring(0, wsUrl.length() - 1);
        }
        wsUrl += "/api/ws/events";

        Request.Builder requestBuilder = new Request.Builder().url(wsUrl);
        if (!token.isEmpty()) {
            requestBuilder.addHeader("Authorization", "Bearer " + token);
        }

        Log.i(TAG, "Connecting WebSocket to: " + wsUrl);

        if (webSocket != null) {
            try {
                webSocket.close(1000, "Reconnecting");
            } catch (Exception ignored) {}
        }

        webSocket = client.newWebSocket(requestBuilder.build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                isConnected = true;
                broadcastStatus(true);
                updateServiceNotification("Connected & Monitoring Active");
                Log.i(TAG, "Gawkr Alert WebSocket Connected!");
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                handleEventMessage(text);
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                isConnected = false;
                broadcastStatus(false);
                updateServiceNotification("Disconnected. Reconnecting…");
                scheduleReconnect();
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                isConnected = false;
                broadcastStatus(false);
                updateServiceNotification("Connection lost. Retrying in 5s…");
                Log.w(TAG, "WebSocket failure: " + t.getMessage());
                scheduleReconnect();
            }
        });
    }

    private void scheduleReconnect() {
        if (isDestroyed) return;
        reconnectHandler.removeCallbacksAndMessages(null);
        reconnectHandler.postDelayed(this::connectWebSocket, 5000);
    }

    private void broadcastStatus(boolean connected) {
        Intent intent = new Intent(ACTION_STATUS_CHANGE);
        intent.putExtra(EXTRA_CONNECTED, connected);
        sendBroadcast(intent);
    }

    private void handleEventMessage(String jsonStr) {
        try {
            JSONObject obj = new JSONObject(jsonStr);
            String camName = obj.optString("camera_name", "Surveillance");
            String aiDesc = obj.optString("ai_description", "");
            String threatLevel = obj.optString("threat_level", "Safe");
            String rawSnapUrl = obj.optString("snapshot_url", "");

            // Build full snapshot URL if relative
            String fullSnapUrl = rawSnapUrl;
            if (rawSnapUrl.startsWith("/")) {
                SharedPreferences prefs = getSharedPreferences("gawkr_prefs", Context.MODE_PRIVATE);
                String serverUrl = prefs.getString("server_url", "");
                if (serverUrl.endsWith("/")) {
                    serverUrl = serverUrl.substring(0, serverUrl.length() - 1);
                }
                fullSnapUrl = serverUrl + rawSnapUrl;
            }

            // Extract labels
            StringBuilder labelsBuilder = new StringBuilder();
            JSONArray objectsArr = obj.optJSONArray("objects");
            if (objectsArr != null && objectsArr.length() > 0) {
                for (int i = 0; i < objectsArr.length(); i++) {
                    JSONObject det = objectsArr.getJSONObject(i);
                    String lbl = det.optString("label", "");
                    if (!lbl.isEmpty()) {
                        if (labelsBuilder.length() > 0) labelsBuilder.append(", ");
                        labelsBuilder.append(lbl.substring(0, 1).toUpperCase()).append(lbl.substring(1));
                    }
                }
            }
            String labels = labelsBuilder.length() > 0 ? labelsBuilder.toString() : "Motion Detected";

            // Spawn background thread to fetch image and show notification
            final String finalSnapUrl = fullSnapUrl;
            new Thread(() -> NotificationHelper.showSecurityAlert(
                    GawkrPushService.this,
                    camName,
                    labels,
                    aiDesc,
                    finalSnapUrl,
                    threatLevel
            )).start();

        } catch (Exception e) {
            Log.e(TAG, "Failed to parse security event JSON", e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "RECONNECT".equals(intent.getAction())) {
            connectWebSocket();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        isDestroyed = true;
        reconnectHandler.removeCallbacksAndMessages(null);
        if (webSocket != null) {
            webSocket.close(1000, "Service destroyed");
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
