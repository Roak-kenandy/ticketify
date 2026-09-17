# Native Background Location Services - Implementation Summary

## Overview

We have successfully implemented native background location services for both Android and iOS platforms in the TiketifyApp React Native application. This provides reliable background location tracking that continues even when the app is closed or in the background.

## Android Implementation

### Native Android Components

1. **BackgroundLocationService.java** (`android/app/src/main/java/com/tiketifyapp/BackgroundLocationService.java`)
   - Foreground service using `FusedLocationProviderClient`
   - Persistent notification for user visibility
   - Location updates every 15 seconds with 10-meter distance filter
   - HTTP POST requests to API using OkHttp
   - Automatic retry logic and error handling

2. **BackgroundLocationModule.java** (`android/app/src/main/java/com/tiketifyapp/BackgroundLocationModule.java`)
   - React Native bridge module
   - Exposes start/stop/status methods to JavaScript
   - Handles permissions and service lifecycle

3. **BackgroundLocationPackage.java** (`android/app/src/main/java/com/tiketifyapp/BackgroundLocationPackage.java`)
   - Package registration for the native module

### Configuration Files

1. **AndroidManifest.xml** - Added permissions and service declarations:
   ```xml
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
   <service android:name=".BackgroundLocationService" android:foregroundServiceType="location" />
   ```

2. **build.gradle** - Added dependencies:
   ```gradle
   implementation 'com.google.android.gms:play-services-location:21.0.1'
   implementation 'com.squareup.okhttp3:okhttp:4.9.3'
   ```

3. **Notification Icon** - Added `ic_location.png` in multiple densities

## iOS Implementation

### Native iOS Components

1. **BackgroundLocationManager.h** (`ios/TiketifyApp/BackgroundLocationManager.h`)
   - Objective-C header file defining the interface
   - CLLocationManager delegate protocol
   - Properties for location manager, timer, and background task

2. **BackgroundLocationManager.m** (`ios/TiketifyApp/BackgroundLocationManager.m`)
   - Complete implementation using Core Location
   - Background task management for extended execution time
   - Significant location changes for background updates
   - Timer-based location requests every 15 seconds
   - NSURLSession for HTTP requests
   - Location filtering for accuracy and age

### Configuration Files

1. **Info.plist** - Already configured with:
   ```xml
   <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
   <key>NSLocationAlwaysUsageDescription</key>
   <key>NSLocationWhenInUseUsageDescription</key>
   <key>UIBackgroundModes</key>
   <array>
     <string>location</string>
   </array>
   ```

## React Native Integration

### NativeBackgroundLocationService.tsx

Provides a unified interface for both platforms:
- `start(apiEndpoint, authToken)` - Starts the native background service
- `stop()` - Stops the background service
- `isRunning()` - Checks service status
- `getStatus()` - Returns service state and native module availability

### BackgroundLocationManager.tsx

Updated to use native services on both platforms:
- **Android**: Uses native foreground service for true background location
- **iOS**: Uses native background location with Core Location
- **Fallback**: React Native background timer for unsupported platforms

## Features

### Common Features (Both Platforms)

1. **Persistent Background Tracking**: Continues location updates when app is closed
2. **API Integration**: Sends location data to `https://api.ticketify.medianet.mv/api/v1/users/location`
3. **Authentication**: Uses Bearer token authentication
4. **Location Filtering**: Filters out inaccurate or stale locations
5. **Error Handling**: Comprehensive error logging and retry mechanisms
6. **Permissions Management**: Handles location permission requests

### Android-Specific Features

1. **Foreground Service**: Visible notification ensures service continuation
2. **Battery Optimization Warning**: Alerts user about battery optimization settings
3. **Play Services Integration**: Uses Google's FusedLocationProviderClient
4. **OkHttp Networking**: Reliable HTTP client with connection pooling

### iOS-Specific Features

1. **Background Task Management**: Extends app execution time in background
2. **Significant Location Changes**: iOS-optimized background location updates
3. **Core Location Integration**: Native iOS location services
4. **NSURLSession Networking**: Native iOS HTTP networking

## API Payload Format

Both implementations send the same JSON payload:

```json
{
  "latitude": 4.175056,
  "longitude": 73.508897,
  "accuracy": 10.0,
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Logging and Debugging

Both platforms provide comprehensive logging:
- Service start/stop events
- Location updates and filtering
- Network requests and responses
- Error conditions and retries
- Permission status changes

## Usage

The background location service is automatically managed by the `BackgroundLocationManager` component:

1. **Automatic Start**: Starts when user is authenticated and has location permissions
2. **Platform Detection**: Automatically uses the appropriate native service
3. **Permission Handling**: Requests permissions as needed
4. **Token Management**: Updates authentication token when it changes
5. **Cleanup**: Stops service when component unmounts

## Benefits

1. **True Background Operation**: Location updates continue even when app is terminated
2. **Battery Optimization**: Platform-specific optimizations for power efficiency
3. **Reliability**: Native implementation more reliable than JavaScript-only solutions
4. **User Experience**: Transparent operation with appropriate user notifications
5. **Cross-Platform**: Unified API with platform-specific optimizations

## Testing

Both implementations have been successfully built and tested:
- Android builds successfully with all dependencies
- iOS builds successfully with Core Location integration
- React Native bridge properly connects to native modules
- Location permissions and service lifecycle work correctly

This implementation provides enterprise-grade background location tracking suitable for workforce management and field service applications.
