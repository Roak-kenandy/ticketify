package com.ticketify;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class BackgroundLocationService extends Service {
    private static final String TAG = "BGLocationService";
    private static final String CHANNEL_ID = "location_service_channel";
    private static final int NOTIFICATION_ID = 1;
    private static final int LOCATION_UPDATE_INTERVAL = 15000; // 15 seconds
    
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private LocationRequest locationRequest;
    private OkHttpClient httpClient;
    private String apiEndpoint;
    private String authToken;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Background Location Service Created");
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        
        // Configure HTTP client with longer timeouts
        httpClient = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build();
        
        createNotificationChannel();
        setupLocationCallback();
        setupLocationRequest();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Background Location Service Started");
        
        if (intent != null) {
            apiEndpoint = intent.getStringExtra("apiEndpoint");
            authToken = intent.getStringExtra("authToken");
            Log.d(TAG, "API Endpoint: " + apiEndpoint);
            Log.d(TAG, "Has Token: " + (authToken != null && !authToken.isEmpty()));
        }
        
        startForeground(NOTIFICATION_ID, createNotification());
        startLocationUpdates();
        
        // Return START_STICKY to ensure service restarts if killed
        return START_STICKY;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Background Location Service Destroyed");
        stopLocationUpdates();
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdown();
        }
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Location Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Tracking location for Ticketify");
            channel.setShowBadge(false);
            
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }
    
    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Ticketify Location Service")
            .setContentText("Tracking location in background")
            .setSmallIcon(R.drawable.ic_notification) // You'll need to add this icon
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
    
    private void setupLocationRequest() {
        locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL)
            .setWaitForAccurateLocation(false)
            .setMinUpdateIntervalMillis(LOCATION_UPDATE_INTERVAL / 2)
            .setMaxUpdateDelayMillis(LOCATION_UPDATE_INTERVAL * 2)
            .build();
    }
    
    private void setupLocationCallback() {
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                super.onLocationResult(locationResult);
                
                if (locationResult == null) {
                    Log.w(TAG, "Location result is null");
                    return;
                }
                
                for (Location location : locationResult.getLocations()) {
                    Log.d(TAG, String.format("Location received: lat=%.6f, lng=%.6f, accuracy=%.1fm", 
                        location.getLatitude(), location.getLongitude(), location.getAccuracy()));
                    
                    sendLocationToServer(location);
                }
            }
        };
    }
    
    private void startLocationUpdates() {
        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
            Log.d(TAG, "Location updates started");
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission not granted", e);
            stopSelf();
        }
    }
    
    private void stopLocationUpdates() {
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            Log.d(TAG, "Location updates stopped");
        }
    }
    
    private void sendLocationToServer(Location location) {
        if (apiEndpoint == null || authToken == null) {
            Log.w(TAG, "API endpoint or token is null, cannot send location");
            return;
        }
        
        try {
            // Create location JSON
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            dateFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
            String timestamp = dateFormat.format(new Date(location.getTime()));
            
            String json = String.format(Locale.US,
                "{\"latitude\":%.6f,\"longitude\":%.6f,\"accuracy\":%.1f,\"timestamp\":\"%s\"}",
                location.getLatitude(), location.getLongitude(), location.getAccuracy(), timestamp);
            
            RequestBody body = RequestBody.create(json, MediaType.get("application/json; charset=utf-8"));
            
            Request request = new Request.Builder()
                .url(apiEndpoint)
                .post(body)
                .addHeader("Authorization", "Bearer " + authToken)
                .addHeader("Content-Type", "application/json")
                .build();
            
            Log.d(TAG, "Sending location to server: " + json);
            
            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to send location to server", e);
                    // TODO: Store offline for later sync
                }
                
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "Location sent to server successfully");
                    } else {
                        Log.e(TAG, "Server returned error: " + response.code() + " " + response.message());
                    }
                    response.close();
                }
            });
            
        } catch (Exception e) {
            Log.e(TAG, "Error sending location to server", e);
        }
    }
}
