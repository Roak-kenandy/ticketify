#import <Foundation/Foundation.h>
#import <CoreLocation/CoreLocation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface BackgroundLocationManager : NSObject <RCTBridgeModule, CLLocationManagerDelegate>

@end
