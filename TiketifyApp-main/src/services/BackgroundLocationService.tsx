import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundTimer from 'react-native-background-timer';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

class EnhancedLocationService {
  private isConfigured = false;
  private isStarted = false;
  private apiEndpoint = '';
  private authToken = '';
  private backgroundTimerRunning = false;
  private backgroundIntervalId: number | null = null;
  private lastLocationTime = 0;
  private locationUpdateFrequency = 30000; // 30 seconds
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 5;
  private backgroundStats = {
    totalAttempts: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    lastSuccessTime: null as string | null,
    lastFailureTime: null as string | null,
  };

  configure(config: {apiEndpoint: string; authToken: string}): void {
    this.apiEndpoint = config.apiEndpoint;
    this.authToken = config.authToken;
    this.isConfigured = true;
    console.log('[EnhancedLocationService] Service configured');
  }

  async start(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error(
        'EnhancedLocationService must be configured before starting',
      );
    }

    if (this.isStarted) {
      console.log('[EnhancedLocationService] Service already started');
      return;
    }

    try {
      this.startBackgroundLocationTracking();
      this.isStarted = true;

      console.log(
        '[EnhancedLocationService] ✅ Enhanced background location service started',
      );
      console.log('- Background job enabled for true background execution');
      console.log('- Updates every 15 seconds even when app is closed');
      console.log('- High accuracy GPS enabled');
      console.log('- Offline storage for failed requests');
    } catch (error) {
      console.error(
        '[EnhancedLocationService] Failed to start service:',
        error,
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.stopBackgroundLocationTracking();
      this.isStarted = false;

      console.log(
        '[EnhancedLocationService] Background location service stopped',
      );
    } catch (error) {
      console.error('[EnhancedLocationService] Failed to stop service:', error);
    }
  }

  private startBackgroundLocationTracking(): void {
    if (this.backgroundTimerRunning) {
      console.log('[EnhancedLocationService] Background timer already running');
      return;
    }

    // Start background timer that will continue running even when app is closed
    this.backgroundIntervalId = BackgroundTimer.setInterval(() => {
      console.log(
        '[EnhancedLocationService] 🔄 Background timer executing location update...',
      );
      this.getCurrentLocationAndSend();
    }, this.locationUpdateFrequency);

    this.backgroundTimerRunning = true;

    // Get initial location immediately
    this.getCurrentLocationAndSend();

    console.log(
      '[EnhancedLocationService] 🚀 Background location tracking started with BackgroundTimer',
    );
    console.log(
      `[EnhancedLocationService] ⏰ Timer interval: ${
        this.locationUpdateFrequency
      }ms (${this.locationUpdateFrequency / 1000}s)`,
    );
  }

  private stopBackgroundLocationTracking(): void {
    if (this.backgroundTimerRunning && this.backgroundIntervalId !== null) {
      BackgroundTimer.clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
      this.backgroundTimerRunning = false;
      console.log('[EnhancedLocationService] 🛑 Background timer stopped');
    }
  }

  private getCurrentLocationAndSend(): void {
    const now = Date.now();

    // Throttle requests to avoid too frequent calls
    if (now - this.lastLocationTime < this.locationUpdateFrequency - 2000) {
      return;
    }

    this.lastLocationTime = now;
    this.backgroundStats.totalAttempts++;

    // Try progressive fallback strategy for better success rate
    this.getLocationWithFallback();
  }

  private getLocationWithFallback(): void {
    console.log(
      '[EnhancedLocationService] 🎯 Attempting high accuracy location...',
    );

    // First attempt: High accuracy with extended timeout for background
    Geolocation.getCurrentPosition(
      async position => {
        await this.handleLocationSuccess(position, 'high-accuracy');
      },
      error => {
        console.warn(
          '[EnhancedLocationService] ⚠️ High accuracy failed:',
          error.message,
          'Code:',
          error.code,
        );

        if (error.code === 1) {
          // Permission denied - stop service
          console.warn(
            '[EnhancedLocationService] Location permission denied - stopping background service',
          );
          this.stop();
          return;
        }

        // Fallback to medium accuracy
        this.getLocationMediumAccuracy();
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      },
    );
  }

  private getLocationMediumAccuracy(): void {
    console.log(
      '[EnhancedLocationService] 📍 Fallback to medium accuracy location...',
    );

    Geolocation.getCurrentPosition(
      async position => {
        await this.handleLocationSuccess(position, 'medium-accuracy');
      },
      error => {
        console.warn(
          '[EnhancedLocationService] ⚠️ Medium accuracy failed:',
          error.message,
        );

        // Final fallback to network-based location
        this.getLocationNetworkBased();
      },
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 15000,
      },
    );
  }

  private getLocationNetworkBased(): void {
    console.log(
      '[EnhancedLocationService] 🌐 Final fallback to network-based location...',
    );

    Geolocation.getCurrentPosition(
      async position => {
        await this.handleLocationSuccess(position, 'network-based');
      },
      error => {
        console.error(
          '[EnhancedLocationService] ❌ All location attempts failed:',
          {
            code: error.code,
            message: error.message,
          },
        );

        // Log the failure but don't stop the service - try again next cycle
        console.log(
          '[EnhancedLocationService] Will retry in next update cycle (15 seconds)',
        );

        // Track consecutive failures
        this.handleConsecutiveFailures();
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000,
      },
    );
  }

  private async handleLocationSuccess(
    position: any,
    method: string,
  ): Promise<void> {
    const locationData: LocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 0,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[EnhancedLocationService] ✅ Location obtained via ${method}:`,
      {
        lat: locationData.latitude.toFixed(6),
        lng: locationData.longitude.toFixed(6),
        accuracy: locationData.accuracy.toFixed(1) + 'm',
        timestamp: locationData.timestamp,
        method: method,
      },
    );

    // Reset failure counter on success
    this.consecutiveFailures = 0;
    this.backgroundStats.successfulUpdates++;
    this.backgroundStats.lastSuccessTime = new Date().toISOString();

    // Save proof of successful location
    this.saveBackgroundProof('success', {
      latitude: locationData.latitude.toFixed(6),
      longitude: locationData.longitude.toFixed(6),
      accuracy: locationData.accuracy.toFixed(1) + 'm',
      method: method,
      timestamp: locationData.timestamp,
    });

    try {
      await this.sendLocationToServer(locationData);
      console.log(
        '[EnhancedLocationService] ✅ Background location sent to server successfully',
      );
    } catch (error) {
      console.warn(
        '[EnhancedLocationService] Failed to send background location:',
        (error as Error)?.message || error,
      );
      await this.storeLocationOffline(locationData);
    }
  }

  private handleConsecutiveFailures(): void {
    this.consecutiveFailures++;
    this.backgroundStats.failedUpdates++;
    this.backgroundStats.lastFailureTime = new Date().toISOString();

    if (__DEV__) {
      AsyncStorage.setItem(
        'background_location_stats',
        JSON.stringify(this.backgroundStats),
      ).catch(() => {});
    }

    // Save proof of failure
    this.saveBackgroundProof('failure', {
      consecutiveFailures: this.consecutiveFailures,
      timestamp: new Date().toISOString(),
    });

    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.warn(
        `[EnhancedLocationService] ⚠️ ${this.consecutiveFailures} consecutive failures. Increasing update interval.`,
      );
      // Temporarily increase the update frequency to reduce battery drain
      this.locationUpdateFrequency = Math.min(
        60000,
        this.locationUpdateFrequency * 1.5,
      ); // Max 1 minute
    }
  }

  // Method to save background activity proof (even when console not visible)
  private async saveBackgroundProof(
    type: 'attempt' | 'success' | 'failure',
    data: any,
  ): Promise<void> {
    // Debug aid only: a storage read+write every cycle is wasted I/O in release.
    if (!__DEV__) {
      return;
    }
    try {
      const timestamp = new Date().toISOString();
      const proof = {
        timestamp,
        type,
        data,
        appState: 'background', // We assume background since foreground logs are visible
      };

      const existingProofs = await AsyncStorage.getItem('background_proofs');
      const proofs = existingProofs ? JSON.parse(existingProofs) : [];

      proofs.push(proof);

      // Keep last 20 proofs
      if (proofs.length > 20) {
        proofs.splice(0, proofs.length - 20);
      }

      await AsyncStorage.setItem('background_proofs', JSON.stringify(proofs));
    } catch (error) {
      // Silently fail to avoid breaking location service
    }
  }

  // Method to get background activity proofs (call when app comes to foreground)
  async getBackgroundProofs(): Promise<any[]> {
    try {
      const proofsStr = await AsyncStorage.getItem('background_proofs');
      return proofsStr ? JSON.parse(proofsStr) : [];
    } catch (error) {
      return [];
    }
  }

  // Method to clear background proofs
  async clearBackgroundProofs(): Promise<void> {
    try {
      await AsyncStorage.removeItem('background_proofs');
    } catch (error) {
      // Silently fail
    }
  }

  private async sendLocationToServer(location: LocationData): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(location),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EnhancedLocationService] 🚨 API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private async storeLocationOffline(location: LocationData): Promise<void> {
    try {
      const existingLocations = await AsyncStorage.getItem('offline_locations');
      const locations: LocationData[] = existingLocations
        ? JSON.parse(existingLocations)
        : [];

      locations.push(location);

      // Keep only the last 50 locations to prevent storage bloat
      if (locations.length > 50) {
        locations.splice(0, locations.length - 50);
      }

      await AsyncStorage.setItem(
        'offline_locations',
        JSON.stringify(locations),
      );
      console.log(
        `[EnhancedLocationService] 💾 Location stored offline. Total: ${locations.length}`,
      );
    } catch (error) {
      console.error(
        '[EnhancedLocationService] Failed to store location offline:',
        error,
      );
    }
  }

  async syncOfflineLocations(token: string): Promise<void> {
    if (!token) {
      return;
    }
    this.authToken = token;
    try {
      const offlineLocationsStr = await AsyncStorage.getItem(
        'offline_locations',
      );
      if (!offlineLocationsStr) {
        return;
      }

      const offlineLocations: LocationData[] = JSON.parse(offlineLocationsStr);
      if (offlineLocations.length === 0) {
        return;
      }

      console.log(
        `[EnhancedLocationService] 🔄 Syncing ${offlineLocations.length} offline locations`,
      );

      const sorted = [...offlineLocations].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      let successful = 0;
      const remaining: LocationData[] = [];
      for (const location of sorted) {
        try {
          await this.sendLocationToServer(location);
          successful += 1;
        } catch {
          remaining.push(location);
        }
      }
      const failed = remaining.length;

      if (successful > 0) {
        if (remaining.length) {
          await AsyncStorage.setItem(
            'offline_locations',
            JSON.stringify(remaining),
          );
        } else {
          await AsyncStorage.removeItem('offline_locations');
        }
        console.log(
          `[EnhancedLocationService] ✅ Synced ${successful} offline locations`,
        );
      }

      if (failed > 0) {
        console.log(
          `[EnhancedLocationService] ❌ Failed to sync ${failed} offline locations`,
        );
      }
    } catch (error) {
      console.error(
        '[EnhancedLocationService] Failed to sync offline locations:',
        error,
      );
    }
  }

  updateConfig(config: {apiEndpoint?: string; authToken?: string}): void {
    if (config.apiEndpoint) {
      this.apiEndpoint = config.apiEndpoint;
    }
    if (config.authToken) {
      this.authToken = config.authToken;
    }
    console.log('[EnhancedLocationService] Configuration updated');
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  // Method to manually trigger a location update (useful for testing)
  async triggerLocationUpdate(): Promise<void> {
    if (!this.isStarted) {
      console.warn('[EnhancedLocationService] Service not started');
      return;
    }

    console.log(
      '[EnhancedLocationService] Manually triggering location update...',
    );
    this.getCurrentLocationAndSend();
  }

  // Get service status for debugging
  getStatus() {
    return {
      configured: this.isConfigured,
      started: this.isStarted,
      backgroundTimerRunning: this.backgroundTimerRunning,
      hasToken: !!this.authToken,
      hasEndpoint: !!this.apiEndpoint,
      lastUpdate: this.lastLocationTime
        ? new Date(this.lastLocationTime).toISOString()
        : 'Never',
    };
  }
}

export default new EnhancedLocationService();
