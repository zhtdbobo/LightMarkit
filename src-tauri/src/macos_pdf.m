#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <dispatch/dispatch.h>

// WKWebView exposes no public API to obtain an NSPrintOperation; the underscored
// selector below is a stable private method that returns a print operation which
// paginates long content by paper size and honors @media print. Guarded at runtime
// with a single-page createPDFWithConfiguration fallback when unavailable.
@interface WKWebView (LightMarkitPrivatePrint)
- (NSPrintOperation *)_printOperationWithPrintInfo:(NSPrintInfo *)printInfo;
@end

@interface LightMarkitNavigationDelegate : NSObject <WKNavigationDelegate>
@property(nonatomic, assign) BOOL finished;
@property(nonatomic, strong) NSError *error;
@property(nonatomic, copy) void (^completion)(NSError *error);
@end

@implementation LightMarkitNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.finished = YES;
    if (self.completion) {
        self.completion(nil);
    }
}

- (void)webView:(WKWebView *)webView
    didFailNavigation:(WKNavigation *)navigation
           withError:(NSError *)error {
    self.error = error;
    self.finished = YES;
    if (self.completion) {
        self.completion(error);
    }
}

- (void)webView:(WKWebView *)webView
    didFailProvisionalNavigation:(WKNavigation *)navigation
                       withError:(NSError *)error {
    self.error = error;
    self.finished = YES;
    if (self.completion) {
        self.completion(error);
    }
}

@end

static void lightmarkit_set_error(char **error_out, NSString *message) {
    if (!error_out) {
        return;
    }

    const char *utf8 = [message UTF8String];
    *error_out = utf8 ? strdup(utf8) : strdup("Unknown WebKit PDF export error");
}

bool lightmarkit_webkit_create_pdf(
    const char *html_path,
    const char *pdf_path,
    char **error_out
) {
    __block BOOL success = NO;
    __block NSString *error_message = nil;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);

    // Keep the main queue free while WebKit delivers its delegate and completion callbacks.
    dispatch_async(dispatch_get_main_queue(), ^{
        @autoreleasepool {
            NSString *htmlPath = html_path ? [NSString stringWithUTF8String:html_path] : nil;
            NSString *pdfPath = pdf_path ? [NSString stringWithUTF8String:pdf_path] : nil;
            if (!htmlPath || !pdfPath) {
                error_message = @"Invalid HTML or PDF path";
                dispatch_semaphore_signal(done);
                return;
            }

            NSError *readError = nil;
            NSString *html = [NSString stringWithContentsOfFile:htmlPath
                                                        encoding:NSUTF8StringEncoding
                                                           error:&readError];
            if (!html) {
                error_message = readError.localizedDescription ?: @"Safari WebKit failed to read the HTML document";
                dispatch_semaphore_signal(done);
                return;
            }

            NSURL *htmlURL = [NSURL fileURLWithPath:htmlPath];
            WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
            WKWebView *webView = [[WKWebView alloc]
                initWithFrame:NSMakeRect(0, 0, 717, 1046)
                configuration:configuration];
            NSWindow *window = [[NSWindow alloc]
                initWithContentRect:NSMakeRect(0, 0, 717, 1046)
                styleMask:NSWindowStyleMaskBorderless
                backing:NSBackingStoreBuffered
                defer:NO];
            window.opaque = NO;
            window.hasShadow = NO;
            window.releasedWhenClosed = NO;
            window.contentView = webView;
            window.ignoresMouseEvents = YES;
            window.alphaValue = 0.01;
            [window orderFrontRegardless];

            LightMarkitNavigationDelegate *delegate = [LightMarkitNavigationDelegate new];
            webView.navigationDelegate = delegate;
            __block BOOL completed = NO;
            void (^finish)(BOOL, NSString *) = ^(BOOL ok, NSString *message) {
                if (completed) return;
                completed = YES;
                success = ok;
                error_message = message;
                [window orderOut:nil];
                webView.navigationDelegate = nil;
                delegate.completion = nil;
                dispatch_semaphore_signal(done);
            };

            delegate.completion = ^(NSError *navigationError) {
                if (navigationError) {
                    finish(NO, navigationError.localizedDescription ?: @"Safari WebKit failed to load the document");
                    return;
                }

                void (^createPrint)(void) = ^{
                    // The standard print path paginates long content by paper size and
                    // honors @media print. createPDFWithConfiguration only captures the
                    // visible bounds as a single page, so prefer NSPrintOperation here.
                    NSPrintInfo *printInfo = [[NSPrintInfo alloc] init];
                    [printInfo setPaperSize:NSMakeSize(8.27 * 72.0, 11.69 * 72.0)]; // A4
                    [printInfo setOrientation:NSPaperOrientationPortrait];
                    [printInfo setLeftMargin:0.4 * 72.0];
                    [printInfo setRightMargin:0.4 * 72.0];
                    [printInfo setTopMargin:0.4 * 72.0];
                    [printInfo setBottomMargin:0.4 * 72.0];

                    NSMutableDictionary *settings = [[printInfo dictionary] mutableCopy];
                    [settings setObject:NSPrintSaveJob forKey:NSPrintJobDisposition];
                    [settings setObject:[NSURL fileURLWithPath:pdfPath] forKey:NSPrintJobSavingURL];
                    NSPrintInfo *printInfoWithJob = [[NSPrintInfo alloc] initWithDictionary:settings];

                    if ([webView respondsToSelector:@selector(_printOperationWithPrintInfo:)]) {
                        NSPrintOperation *operation = [webView _printOperationWithPrintInfo:printInfoWithJob];
                        [operation setShowsPrintPanel:NO];
                        [operation setShowsProgressPanel:NO];
                        [operation runOperation];

                        if ([[NSFileManager defaultManager] fileExistsAtPath:pdfPath]) {
                            finish(YES, nil);
                        } else {
                            finish(NO, @"Safari WebKit print did not produce the PDF file");
                        }
                        return;
                    }

                    // Fallback: private print API unavailable, keep the single-page path.
                    WKPDFConfiguration *pdfConfiguration = [WKPDFConfiguration new];
                    pdfConfiguration.rect = webView.bounds;
                    [webView createPDFWithConfiguration:pdfConfiguration
                                      completionHandler:^(NSData *pdfData, NSError *pdfError) {
                        if (pdfError) {
                            finish(NO, pdfError.localizedDescription ?: @"Safari WebKit failed to create the PDF");
                        } else if (!pdfData || ![pdfData writeToFile:pdfPath atomically:YES]) {
                            finish(NO, @"Safari WebKit failed to write the PDF file");
                        } else {
                            finish(YES, nil);
                        }
                    }];
                };

                // evaluateJavaScript cannot return a Promise on macOS. Poll a serializable boolean instead.
                __block NSUInteger imageChecks = 0;
                __block void (^waitForImages)(void);
                waitForImages = ^{
                    [webView evaluateJavaScript:
                        @"Array.from(document.images).every(image => image.complete)"
                        completionHandler:^(id result, NSError *scriptError) {
                            if (scriptError) {
                                finish(NO, scriptError.localizedDescription ?: @"Safari WebKit failed to prepare the document");
                                return;
                            }

                            BOOL imagesReady = [result respondsToSelector:@selector(boolValue)] && [result boolValue];
                            if (imagesReady || imageChecks++ >= 50) {
                                createPrint();
                                return;
                            }

                            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC),
                                           dispatch_get_main_queue(), waitForImages);
                        }];
                };
                waitForImages();
            };

            [webView loadHTMLString:html baseURL:htmlURL];
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC),
                           dispatch_get_main_queue(), ^{
                finish(NO, @"Safari WebKit timed out while loading the document (hidden WebKit window did not finish navigation)");
            });
        }
    });

    if ([NSThread isMainThread]) {
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:50.0];
        while (dispatch_semaphore_wait(done, DISPATCH_TIME_NOW) != 0 &&
               [deadline timeIntervalSinceNow] > 0) {
            [[NSRunLoop currentRunLoop]
                runMode:NSRunLoopCommonModes
                beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        if ([deadline timeIntervalSinceNow] <= 0 && !success && !error_message) {
            error_message = @"Safari WebKit timed out while exporting the PDF";
        }
    } else if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_SEC)) != 0) {
        error_message = @"Safari WebKit timed out while exporting the PDF";
    }

    if (!success) {
        lightmarkit_set_error(error_out, error_message ?: @"Safari WebKit PDF export failed");
    }
    return success;
}

void lightmarkit_free_error(char *error) {
    free(error);
}
