// Objective-C bridge that exposes KoshPdfText.swift to React Native.
// Without this file the Swift class isn't visible to the RN bridge.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KoshPdfText, NSObject)

RCT_EXTERN_METHOD(extractText:(NSString *)uri
                  password:(NSString *)password
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(extractTextOcr:(NSString *)uri
                  password:(NSString *)password
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
