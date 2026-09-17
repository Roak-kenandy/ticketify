package com.ticketify;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class BackgroundLocationModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BGLocationModule";
    private ReactApplicationContext reactContext;
    
    public BackgroundLocationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }
    
    @NonNull
    @Override
    public String getName() {
        return "BackgroundLocationModule";
    }
    
    @ReactMethod
    public void startBackgroundLocationService(String apiEndpoint, String authToken, Promise promise) {
        try {
            Log.d(TAG, "Starting background location service");
            Log.d(TAG, "API Endpoint: " + apiEndpoint);
            Log.d(TAG, "Has Token: " + (authToken != null && !authToken.isEmpty()));
            
            Context context = getReactApplicationContext();
            Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
            serviceIntent.putExtra("apiEndpoint", apiEndpoint);
            serviceIntent.putExtra("authToken", authToken);
            
            context.startForegroundService(serviceIntent);
            
            Log.d(TAG, "Background location service started successfully");
            promise.resolve("Background location service started");
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to start background location service", e);
            promise.reject("START_FAILED", "Failed to start background location service: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void stopBackgroundLocationService(Promise promise) {
        try {
            Log.d(TAG, "Stopping background location service");
            
            Context context = getReactApplicationContext();
            Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
            context.stopService(serviceIntent);
            
            Log.d(TAG, "Background location service stopped successfully");
            promise.resolve("Background location service stopped");
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop background location service", e);
            promise.reject("STOP_FAILED", "Failed to stop background location service: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void isServiceRunning(Promise promise) {
        try {
            // This is a simplified check - in a production app you'd want more robust service checking
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Failed to check service status", e);
            promise.reject("STATUS_CHECK_FAILED", "Failed to check service status: " + e.getMessage());
        }
    }
}
