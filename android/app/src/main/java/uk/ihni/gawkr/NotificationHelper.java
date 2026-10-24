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

    public static void showSecurityAlert(Context context, String camName, String objects, String aiDesc, String snapshotUrl, String threatLevel) {
        createChannels(context);

        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                (int) System.currentTimeMillis(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int color = 0xFF10B981; // Safe (Emerald)
        long[] vibration = new long[]{0, 200, 100, 200};
        String threatBadge = "🟢 SAFE";

        if ("Threat".equalsIgnoreCase(threatLevel)) {
            color = 0xFFEF4444; // Threat (Red)
            vibration = new long[]{0, 400, 150, 400, 150, 600};
            threatBadge = "🔴 THREAT DETECTED";
        } else if ("Suspicious".equalsIgnoreCase(threatLevel)) {
            color = 0xFFF59E0B; // Suspicious (Amber)
            vibration = new long[]{0, 250, 150, 250, 150, 250};
            threatBadge = "🟡 SUSPICIOUS ACTIVITY";
        }

        String title = "🚨 " + camName.toUpperCase() + " • " + threatBadge;
        String content = (aiDesc != null && !aiDesc.isEmpty()) ? aiDesc : "Detected: " + objects;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ALERTS_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_gawkr)
                .setContentTitle(title)
                .setContentText(content)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(content))
                .setColor(color)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
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
                            .setSummaryText(content));
                }
            } catch (Exception ignored) {
            }
        }

        try {
            NotificationManagerCompat managerCompat = NotificationManagerCompat.from(context);
            int notificationId = (int) (System.currentTimeMillis() % 100000);
            managerCompat.notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
        }
    }
}
