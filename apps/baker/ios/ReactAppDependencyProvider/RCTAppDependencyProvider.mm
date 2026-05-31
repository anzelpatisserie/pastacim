// Stub implementation — overridden by Xcode's "Generate Dependency Provider" build phase.
#import "RCTAppDependencyProvider.h"

@implementation RCTAppDependencyProvider

- (instancetype)init {
  self = [super init];
  return self;
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge {
  return @[];
}

- (RCTComponentViewFactory *)componentViewFactory {
  return nil;
}

@end
