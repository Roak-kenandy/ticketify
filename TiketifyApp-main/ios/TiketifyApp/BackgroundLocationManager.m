#import "BackgroundLocationManager.h"
#import <React/RCTLog.h>

@interface BackgroundLocationManager ()
@property (nonatomic, strong) CLLocationManager *locationManager;
@property (nonatomic, strong) NSTimer *backgroundTimer;
@property (nonatomic, strong) NSString *apiEndpoint;
@property (nonatomic, strong) NSString *authToken;
@property (nonatomic, assign) BOOL isTracking;
@property (nonatomic, assign) UIBackgroundTaskIdentifier backgroundTask;
@end

@implementation BackgroundLocationManager

RCT_EXPORT_MODULE(BackgroundLocationModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        self.locationManager = [[CLLocationManager alloc] init];
        self.locationManager.delegate = self;
        self.locationManager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters;
        self.locationManager.distanceFilter = 20;
        self.isTracking = NO;
        self.backgroundTask = UIBackgroundTaskInvalid;
        
        // Set up for background location updates
        if ([self.locationManager respondsToSelector:@selector(setAllowsBackgroundLocationUpdates:)]) {
            [self.locationManager setAllowsBackgroundLocationUpdates:YES];
        }
        if ([self.locationManager respondsToSelector:@selector(setPausesLocationUpdatesAutomatically:)]) {
            [self.locationManager setPausesLocationUpdatesAutomatically:NO];
        }
        
        RCTLogInfo(@"[BackgroundLocationManager] iOS Background Location Manager initialized");
    }
    return self;
}

RCT_EXPORT_METHOD(startBackgroundLocationService:(NSString *)apiEndpoint
                  authToken:(NSString *)authToken
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    RCTLogInfo(@"[BackgroundLocationManager] Starting iOS background location service");
    RCTLogInfo(@"[BackgroundLocationManager] Has Token: %@", authToken ? @"YES" : @"NO");
    
    self.apiEndpoint = apiEndpoint;
    self.authToken = authToken;
    
    // Check location permission
    CLAuthorizationStatus status = [CLLocationManager authorizationStatus];
    
    if (status == kCLAuthorizationStatusNotDetermined) {
        [self.locationManager requestAlwaysAuthorization];
        resolve(@"Permission requested - will start when granted");
        return;
    } else if (status != kCLAuthorizationStatusAuthorizedAlways) {
        reject(@"PERMISSION_DENIED", @"Background location permission not granted", nil);
        return;
    }
    
    [self startLocationTracking];
    resolve(@"iOS background location service started");
}

RCT_EXPORT_METHOD(stopBackgroundLocationService:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    RCTLogInfo(@"[BackgroundLocationManager] Stopping iOS background location service");
    [self stopLocationTracking];
    resolve(@"iOS background location service stopped");
}

RCT_EXPORT_METHOD(isServiceRunning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(self.isTracking));
}

- (void)startLocationTracking {
    if (self.isTracking) {
        RCTLogInfo(@"[BackgroundLocationManager] Location tracking already active");
        return;
    }
    
    self.isTracking = YES;
    
    // Start significant location changes for background updates
    if ([CLLocationManager significantLocationChangeMonitoringAvailable]) {
        [self.locationManager startMonitoringSignificantLocationChanges];
        RCTLogInfo(@"[BackgroundLocationManager] - Significant location changes: STARTED");
    } else {
        RCTLogInfo(@"[BackgroundLocationManager] - Significant location changes: NOT AVAILABLE");
    }
    
    // Start background task
    [self startBackgroundTask];
    
    // Start timer for regular updates
    [self startBackgroundTimer];
    
    RCTLogInfo(@"[BackgroundLocationManager] ✅ iOS location tracking started");
}

- (void)stopLocationTracking {
    if (!self.isTracking) {
        return;
    }
    
    self.isTracking = NO;
    
    [self.locationManager stopUpdatingLocation];
    if ([CLLocationManager significantLocationChangeMonitoringAvailable]) {
        [self.locationManager stopMonitoringSignificantLocationChanges];
    }
    
    [self stopBackgroundTimer];
    [self endBackgroundTask];
    
    RCTLogInfo(@"[BackgroundLocationManager] 🛑 iOS location tracking stopped");
}

- (void)startBackgroundTimer {
    if (self.backgroundTimer) {
        [self.backgroundTimer invalidate];
    }
    
    self.backgroundTimer = [NSTimer scheduledTimerWithTimeInterval:30.0
                                                            target:self
                                                          selector:@selector(requestLocationUpdate)
                                                          userInfo:nil
                                                           repeats:YES];
    
    RCTLogInfo(@"[BackgroundLocationManager] ⏰ Background timer started (30s intervals)");
}

- (void)stopBackgroundTimer {
    if (self.backgroundTimer) {
        [self.backgroundTimer invalidate];
        self.backgroundTimer = nil;
        RCTLogInfo(@"[BackgroundLocationManager] ⏰ Background timer stopped");
    }
}

- (void)requestLocationUpdate {
    if (!self.isTracking) {
        return;
    }
    
    RCTLogInfo(@"[BackgroundLocationManager] 🔄 Timer requesting location update...");
    [self.locationManager requestLocation];
}

- (void)startBackgroundTask {
    if (self.backgroundTask != UIBackgroundTaskInvalid) {
        return;
    }
    
    UIApplication *application = [UIApplication sharedApplication];
    
    self.backgroundTask = [application beginBackgroundTaskWithName:@"LocationTracking" expirationHandler:^{
        RCTLogInfo(@"[BackgroundLocationManager] ⚠️ Background task expired, ending task");
        [self endBackgroundTask];
        
        if (self.isTracking) {
            [self startBackgroundTask];
        }
    }];
    
    RCTLogInfo(@"[BackgroundLocationManager] 🚀 Background task started: %lu", (unsigned long)self.backgroundTask);
}

- (void)endBackgroundTask {
    if (self.backgroundTask != UIBackgroundTaskInvalid) {
        UIApplication *application = [UIApplication sharedApplication];
        [application endBackgroundTask:self.backgroundTask];
        self.backgroundTask = UIBackgroundTaskInvalid;
        RCTLogInfo(@"[BackgroundLocationManager] 🛑 Background task ended");
    }
}

#pragma mark - CLLocationManagerDelegate

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
    if (!self.isTracking) {
        return;
    }
    
    CLLocation *location = [locations lastObject];
    
    // Filter out old or inaccurate locations
    NSTimeInterval locationAge = -[location.timestamp timeIntervalSinceNow];
    if (locationAge > 30.0 || location.horizontalAccuracy < 0 || location.horizontalAccuracy > 100) {
        RCTLogInfo(@"[BackgroundLocationManager] ⚠️ Filtering out location: age=%.1fs, accuracy=%.1fm", 
                  locationAge, location.horizontalAccuracy);
        return;
    }
    
    
    [self sendLocationToServer:location];
    
    // Restart background task to get more execution time
    [self endBackgroundTask];
    [self startBackgroundTask];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    RCTLogError(@"[BackgroundLocationManager] ❌ Location error: %@", error.localizedDescription);
    
    [self endBackgroundTask];
    if (self.isTracking) {
        [self startBackgroundTask];
    }
}

- (void)locationManager:(CLLocationManager *)manager didChangeAuthorizationStatus:(CLAuthorizationStatus)status {
    RCTLogInfo(@"[BackgroundLocationManager] 🔐 Location authorization changed: %d", status);
    
    switch (status) {
        case kCLAuthorizationStatusAuthorizedAlways:
            RCTLogInfo(@"[BackgroundLocationManager] ✅ Background location permission granted");
            if (self.apiEndpoint && self.authToken && !self.isTracking) {
                [self startLocationTracking];
            }
            break;
        case kCLAuthorizationStatusAuthorizedWhenInUse:
            RCTLogInfo(@"[BackgroundLocationManager] ⚠️ Only foreground location permission granted");
            [self.locationManager requestAlwaysAuthorization];
            break;
        case kCLAuthorizationStatusDenied:
        case kCLAuthorizationStatusRestricted:
            RCTLogInfo(@"[BackgroundLocationManager] ❌ Location permission denied");
            [self stopLocationTracking];
            break;
        default:
            break;
    }
}

- (void)sendLocationToServer:(CLLocation *)location {
    if (!self.apiEndpoint || !self.authToken) {
        RCTLogError(@"[BackgroundLocationManager] ❌ Missing API endpoint or token");
        return;
    }
    
    // Create location data
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    [formatter setDateFormat:@"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"];
    [formatter setTimeZone:[NSTimeZone timeZoneWithAbbreviation:@"UTC"]];
    NSString *timestamp = [formatter stringFromDate:location.timestamp];
    
    NSDictionary *locationData = @{
        @"latitude": @(location.coordinate.latitude),
        @"longitude": @(location.coordinate.longitude),
        @"accuracy": @(location.horizontalAccuracy),
        @"timestamp": timestamp
    };
    
    // Convert to JSON
    NSError *jsonError;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:locationData
                                                       options:0
                                                         error:&jsonError];
    
    if (jsonError) {
        RCTLogError(@"[BackgroundLocationManager] ❌ JSON serialization error: %@", jsonError);
        return;
    }
    
    // Create request
    NSURL *url = [NSURL URLWithString:self.apiEndpoint];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    [request setHTTPMethod:@"POST"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [request setValue:[NSString stringWithFormat:@"Bearer %@", self.authToken] forHTTPHeaderField:@"Authorization"];
    [request setHTTPBody:jsonData];
    [request setTimeoutInterval:30.0];
    
    RCTLogInfo(@"[BackgroundLocationManager] 📡 Sending location to server...");
    
    // Send request
    NSURLSessionTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request
                                                             completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            RCTLogError(@"[BackgroundLocationManager] ❌ Network error: %@", error.localizedDescription);
            return;
        }
        
        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode == 200 || httpResponse.statusCode == 201) {
            RCTLogInfo(@"[BackgroundLocationManager] ✅ Location sent successfully (HTTP %ld)", (long)httpResponse.statusCode);
        } else {
            RCTLogError(@"[BackgroundLocationManager] ❌ Server error: HTTP %ld", (long)httpResponse.statusCode);
        }
    }];
    
    [task resume];
}

// Required for RCTBridgeModule
- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end
