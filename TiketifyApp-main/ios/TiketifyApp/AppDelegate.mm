#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

static NSInteger const TKPrivacyOverlayTag = 0x7A11;

@implementation AppDelegate

// Hide customer data from the app-switcher snapshot.
- (void)applicationWillResignActive:(UIApplication *)application
{
  if ([RCTAppDelegate instancesRespondToSelector:_cmd]) {
    [super applicationWillResignActive:application];
  }
  if (self.window == nil || [self.window viewWithTag:TKPrivacyOverlayTag] != nil) {
    return;
  }
  UIVisualEffectView *overlay =
      [[UIVisualEffectView alloc] initWithEffect:[UIBlurEffect effectWithStyle:UIBlurEffectStyleRegular]];
  overlay.frame = self.window.bounds;
  overlay.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  overlay.tag = TKPrivacyOverlayTag;
  [self.window addSubview:overlay];
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
  if ([RCTAppDelegate instancesRespondToSelector:_cmd]) {
    [super applicationDidBecomeActive:application];
  }
  [[self.window viewWithTag:TKPrivacyOverlayTag] removeFromSuperview];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"TiketifyApp";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
