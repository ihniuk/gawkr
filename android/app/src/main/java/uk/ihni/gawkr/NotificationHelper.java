package uk.ihni.gawkr;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NotificationHelper {
    public static final String ALERTS_CHANNEL_ID = "gawkr_security_alerts";
    public static final String SERVICE_CHANNEL_ID = "gawkr_service_channel";

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;

            // 1. High Priority Alerts Channel
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .build();

            NotificationChannel alertChannel = new NotificationChannel(
                    ALERTS_CHANNEL_ID,
                    context.getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription(context.getString(R.string.notification_channel_desc));
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
            alertChannel.setSound(soundUri, audioAttributes);
            manager.createNotificationChannel(alertChannel);

            // 2. Foreground Monitoring Service Channel (Silent)
            NotificationChannel serviceChannel = new NotificationChannel(
                    SERVICE_CHANNEL_ID,
                    "Gawkr Background Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Keeps real-time security push listener alive");
            manager.createNotificationChannel(serviceChannel);
        }
    }

    public static String cleanAiDescription(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return "";

        // Remove bracketed verdicts like [Safe], [Threat], [Suspicious]
        s = s.replaceAll("(?i)\\[(safe|suspicious|threat|low|medium|high|critical)\\]", "");
        // Remove trailing threat assessment lines like "Threat Assessment: Safe." or "Verdict: Safe."
        s = s.replaceAll("(?i)(threat assessment|assessment|verdict|threat level|safety threat)\\s*[:\\-]?\\s*(safe|suspicious|threat|low|medium|high|critical)\\.?", "");
        // Remove markdown bolding
        s = s.replace("**", "").replace("*", "");
        s = s.trim();

        // Remove trailing periods, commas, colons
        while (s.endsWith(".") || s.endsWith(",") || s.endsWith(":") || s.endsWith(";")) {
            s = s.substring(0, s.length() - 1).trim();
        }

        return s;
    }

    public static void showSecurityAlert(Context context, String camName, String objects, String aiDesc, String snapshotUrl, String threatLevel) {
        showSecurityAlert(context, camName, camName, objects, aiDesc, snapshotUrl, threatLevel);
    }

    public static void showSecurityAlert(Context context, String camId, String camName, String objects, String aiDesc, String snapshotUrl, String threatLevel) {
        createChannels(context);

        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                (int) System.currentTimeMillis(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        boolean isHighOrCritical = "Threat".equalsIgnoreCase(threatLevel)
                || "High".equalsIgnoreCase(threatLevel)
                || "Critical".equalsIgnoreCase(threatLevel);

        // Format short AI description or fallback to detected objects
        String cleanDesc = cleanAiDescription(aiDesc);
        if (cleanDesc.isEmpty()) {
            cleanDesc = (objects != null && !objects.isEmpty() && !"null".equalsIgnoreCase(objects))
                    ? objects
                    : "Activity";
        }

        // "{ short AI description} at {camera name}"
        String mainText = cleanDesc + " at " + camName;

        String title;
        int color;
        long[] vibration;
        int priority;

        if (isHighOrCritical) {
            title = "🚨 HIGH THREAT • " + mainText;
            color = 0xFFEF4444; // Threat (Red)
            vibration = new long[]{0, 400, 150, 400, 150, 600};
            priority = NotificationCompat.PRIORITY_HIGH;
        } else {
            // If threat alert is anything other than High/critical, don't include the threat level
            title = mainText;
            color = 0xFF10B981; // Safe (Emerald)
            vibration = new long[]{0, 150};
            priority = NotificationCompat.PRIORITY_DEFAULT;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ALERTS_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_gawkr)
                .setContentTitle(title)
                .setContentText(mainText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(mainText))
                .setColor(color)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setGroup("uk.ihni.gawkr.ALERTS")
                .setPriority(priority)
                .setVibrate(vibration);

        // Fetch snapshot image if present
        if (snapshotUrl != null && !snapshotUrl.isEmpty()) {
            try {
                URL url = new URL(snapshotUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.connect();
                InputStream in = conn.getInputStream();
                Bitmap bitmap = BitmapFactory.decodeStream(in);
                if (bitmap != null) {
                    builder.setLargeIcon(bitmap);
                    builder.setStyle(new NotificationCompat.BigPictureStyle()
                            .bigPicture(bitmap)
                            .setBigContentTitle(title)
                            .setSummaryText(mainText));
                }
            } catch (Exception ignored) {
            }
        }

        try {
            NotificationManagerCompat managerCompat = NotificationManagerCompat.from(context);
            // Stable notification ID per camera so consecutive events update the existing card
            int notificationId = Math.abs((camId != null ? camId : camName).toLowerCase().hashCode());
            managerCompat.notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
        }
    }
}
