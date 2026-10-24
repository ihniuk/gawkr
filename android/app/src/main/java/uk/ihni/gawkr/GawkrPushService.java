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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
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

    // Deduplication cache to prevent re-alerting for the same event ID
    private final LinkedHashMap<String, Long> notifiedEvents = new LinkedHashMap<String, Long>(100, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
            return size() > 100;
        }
    };

    // Per-camera alert cooldown (minimum 25s between repeat pushes for same camera)
    private final Map<String, Long> cameraLastAlertTime = new ConcurrentHashMap<>();

    // Short latch for events waiting for AI Vision enrichment from server (up to 2.2s)
    private final ConcurrentHashMap<String, CountDownLatch> pendingAiLatches = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, JSONObject> latestEventPayloads = new ConcurrentHashMap<>();

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

    private String getCleanAiDescription(JSONObject eventObj) {
        if (eventObj.isNull("ai_description")) return "";
        String raw = eventObj.optString("ai_description", "").trim();
        return NotificationHelper.cleanAiDescription(raw);
    }

    private void handleEventMessage(String jsonStr) {
        try {
            JSONObject root = new JSONObject(jsonStr);
            String msgType = root.optString("type", "");

            // STRICT FILTER: Ignore telemetry updates, heartbeats, and non-alert messages!
            if (!"DETECTION_ALERT".equals(msgType)) {
                return;
            }

            JSONObject eventObj = root.optJSONObject("event");
            if (eventObj == null) {
                return;
            }

            String eventId = eventObj.optString("id", "");
            if (eventId.isEmpty()) {
                return;
            }

            // If we already fully dispatched a notification for this event ID, ignore
            synchronized (notifiedEvents) {
                if (notifiedEvents.containsKey(eventId)) {
                    return;
                }
            }

            String aiDesc = getCleanAiDescription(eventObj);

            if (aiDesc.isEmpty()) {
                // Initial detection without AI Vision yet: wait up to 2.2 seconds for
                // server's AI Vision enhancement to arrive
                latestEventPayloads.put(eventId, eventObj);
                CountDownLatch existingLatch = pendingAiLatches.get(eventId);
                if (existingLatch == null) {
                    CountDownLatch latch = new CountDownLatch(1);
                    pendingAiLatches.put(eventId, latch);

                    new Thread(() -> {
                        try {
                            latch.await(2200, TimeUnit.MILLISECONDS);
                        } catch (InterruptedException ignored) {}
                        pendingAiLatches.remove(eventId);
                        JSONObject latestObj = latestEventPayloads.remove(eventId);
                        if (latestObj != null) {
                            processAndDispatchAlert(latestObj);
                        }
                    }).start();
                }
            } else {
                // AI description is present!
                latestEventPayloads.put(eventId, eventObj);
                CountDownLatch latch = pendingAiLatches.remove(eventId);
                if (latch != null) {
                    // Unblock waiter so it immediately dispatches with the AI description
                    latch.countDown();
                } else {
                    processAndDispatchAlert(eventObj);
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Failed to parse security event JSON", e);
        }
    }

    private void processAndDispatchAlert(JSONObject eventObj) {
        try {
            String eventId = eventObj.optString("id", "");
            if (eventId.isEmpty()) return;

            // Deduplicate: mark event as notified so we never alert twice for the same event
            synchronized (notifiedEvents) {
                if (notifiedEvents.containsKey(eventId)) {
                    return;
                }
                notifiedEvents.put(eventId, System.currentTimeMillis());
            }

            String camId = eventObj.optString("camera_id", "default");
            String camName = eventObj.optString("camera_name", "Surveillance");
            String threatLevel = eventObj.optString("threat_level", "Safe");
            String aiDesc = getCleanAiDescription(eventObj);
            String rawSnapUrl = eventObj.optString("snapshot_url", "");

            // Per-camera rate-limiting: at least 25s cooldown between notifications for same camera
            // unless threat level is elevated (Threat/Suspicious/High/Critical)
            long now = System.currentTimeMillis();
            Long lastTime = cameraLastAlertTime.get(camId);
            boolean isElevatedThreat = "Threat".equalsIgnoreCase(threatLevel)
                    || "High".equalsIgnoreCase(threatLevel)
                    || "Critical".equalsIgnoreCase(threatLevel)
                    || "Suspicious".equalsIgnoreCase(threatLevel);

            if (!isElevatedThreat && lastTime != null && (now - lastTime) < 25000) {
                Log.d(TAG, "Suppressed rapid repeat alert for camera: " + camName);
                return;
            }
            cameraLastAlertTime.put(camId, now);

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

            // Extract labels for fallback
            StringBuilder labelsBuilder = new StringBuilder();
            JSONArray objectsArr = eventObj.optJSONArray("objects");
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
            String labels = labelsBuilder.length() > 0 ? labelsBuilder.toString() : "Activity";

            final String finalSnapUrl = fullSnapUrl;
            final String finalCamId = camId;
            final String finalAiDesc = aiDesc;
            new Thread(() -> NotificationHelper.showSecurityAlert(
                    GawkrPushService.this,
                    finalCamId,
                    camName,
                    labels,
                    finalAiDesc,
                    finalSnapUrl,
                    threatLevel
            )).start();

        } catch (Exception e) {
            Log.e(TAG, "Error dispatching alert", e);
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
