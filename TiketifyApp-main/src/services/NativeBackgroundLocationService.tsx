import { NativeModules } from 'react-native';

const { BackgroundLocationModule } = NativeModules;

interface BackgroundLocationModule {
  startBackgroundLocationService(apiEndpoint: string, authToken: string): Promise<string>;
  stopBackgroundLocationService(): Promise<string>;
  isServiceRunning(): Promise<boolean>;
}

class NativeBackgroundLocationService {
  private isStarted = false;

  async start(apiEndpoint: string, authToken: string): Promise<void> {
    try {
      console.log('[NativeBackgroundLocationService] Starting native background location service');
      console.log('- API Endpoint:', apiEndpoint);
      console.log('- Has Token:', !!authToken);
      console.log('- Native Module Available:', !!BackgroundLocationModule);
      
      if (!BackgroundLocationModule) {
        throw new Error('BackgroundLocationModule native module not found. Make sure the native code is properly linked.');
      }
      
      const result = await BackgroundLocationModule.startBackgroundLocationService(apiEndpoint, authToken);
      this.isStarted = true;
      
      console.log('[NativeBackgroundLocationService] ✅ Native service started:', result);
    } catch (error) {
      console.error('[NativeBackgroundLocationService] ❌ Failed to start native service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      console.log('[NativeBackgroundLocationService] Stopping native background location service');
      
      if (!BackgroundLocationModule) {
        console.log('[NativeBackgroundLocationService] Native module not available, skipping stop');
        this.isStarted = false;
        return;
      }
      
      const result = await BackgroundLocationModule.stopBackgroundLocationService();
      this.isStarted = false;
      
      console.log('[NativeBackgroundLocationService] ✅ Native service stopped:', result);
    } catch (error) {
      console.error('[NativeBackgroundLocationService] ❌ Failed to stop native service:', error);
      throw error;
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      if (!BackgroundLocationModule) {
        console.log('[NativeBackgroundLocationService] Native module not available, returning false');
        return false;
      }
      return await BackgroundLocationModule.isServiceRunning();
    } catch (error) {
      console.error('[NativeBackgroundLocationService] ❌ Failed to check service status:', error);
      return false;
    }
  }

  getStatus() {
    return {
      started: this.isStarted,
      hasNativeModule: !!BackgroundLocationModule
    };
  }
}

export default new NativeBackgroundLocationService();
