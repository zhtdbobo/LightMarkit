#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <dispatch/dispatch.h>

@interface LightMarkitNavigationDelegate : NSObject <WKNavigationDelegate>
@property(nonatomic, assign) BOOL finished;
@property(nonatomic, strong) NSError *error;
@end

@implementation LightMarkitNavigationDelegate

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    self.finished = YES;
}

- (void)webView:(WKWebView *)webView
    didFailNavigation:(WKNavigation *)navigation
           withError:(NSError *)error {
    self.error = error;
    self.finished = YES;
}

- (void)webView:(WKWebView *)webView
    didFailProvisionalNavigation:(WKNavigation *)navigation
                       withError:(NSError *)error {
    self.error = error;
    self.finished = YES;
}

@end

static void lightmarkit_set_error(char **error_out, NSString *message) {
    if (!error_out) {
        return;
    }

    const char *utf8 = [message UTF8String];
    *error_out = utf8 ? strdup(utf8) : strdup("Unknown WebKit PDF export error");
}

static void lightmarkit_run_main_sync(void (^work)(void)) {
    if ([NSThread isMainThread]) {
        work();
        return;
    }

    dispatch_sync(dispatch_get_main_queue(), work);
}

bool lightmarkit_webkit_create_pdf(
    const char *html_path,
    const char *pdf_path,
    char **error_out
) {
    __block BOOL success = NO;
    __block NSString *error_message = nil;

    lightmarkit_run_main_sync(^{
        @autoreleasepool {
            NSString *htmlPath = html_path ? [NSString stringWithUTF8String:html_path] : nil;
            NSString *pdfPath = pdf_path ? [NSString stringWithUTF8String:pdf_path] : nil;
            if (!htmlPath || !pdfPath) {
                error_message = @"Invalid HTML or PDF path";
                return;
            }

            NSURL *htmlURL = [NSURL fileURLWithPath:htmlPath];
            NSError *readError = nil;
            NSString *html = [NSString stringWithContentsOfFile:htmlPath
                                                        encoding:NSUTF8StringEncoding
                                                           error:&readError];
            if (!html) {
                error_message = readError.localizedDescription ?: @"Safari WebKit failed to read the HTML document";
                return;
            }

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
            [window setFrameOrigin:NSMakePoint(-10000, -10000)];
            [window orderFrontRegardless];
            LightMarkitNavigationDelegate *delegate = [LightMarkitNavigationDelegate new];
            webView.navigationDelegate = delegate;

            [webView loadHTMLString:html baseURL:htmlURL];

            NSDate *navigationDeadline = [NSDate dateWithTimeIntervalSinceNow:30.0];
            while (!delegate.finished && [navigationDeadline timeIntervalSinceNow] > 0) {
                [[NSRunLoop currentRunLoop]
                    runMode:NSDefaultRunLoopMode
                    beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
            }

            if (!delegate.finished) {
                error_message = @"Safari WebKit timed out while loading the document (hidden WebKit window did not finish navigation)";
                [window orderOut:nil];
                return;
            }
            if (delegate.error) {
                error_message = delegate.error.localizedDescription ?: @"Safari WebKit failed to load the document";
                [window orderOut:nil];
                return;
            }

            // Let local images, fonts, and already-rendered Mermaid SVGs settle before printing.
            __block BOOL scriptFinished = NO;
            [webView evaluateJavaScript:
                @"new Promise(resolve => { const images = Array.from(document.images); "
                 "if (!images.length) { resolve(true); return; } "
                 "let pending = images.length; const done = () => { if (--pending <= 0) resolve(true); }; "
                 "images.forEach(image => image.complete ? done() : "
                 "(image.addEventListener('load', done, { once: true }), "
                 "image.addEventListener('error', done, { once: true }))); "
                 "setTimeout(() => resolve(false), 5000); })"
                completionHandler:^(id result, NSError *error) {
                    if (error && !error_message) {
                        error_message = error.localizedDescription;
                    }
                    scriptFinished = YES;
                }];

            NSDate *scriptDeadline = [NSDate dateWithTimeIntervalSinceNow:6.0];
            while (!scriptFinished && [scriptDeadline timeIntervalSinceNow] > 0) {
                [[NSRunLoop currentRunLoop]
                    runMode:NSDefaultRunLoopMode
                    beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
            }

            if (error_message) {
                [window orderOut:nil];
                return;
            }

            WKPDFConfiguration *pdfConfiguration = [WKPDFConfiguration new];
            pdfConfiguration.rect = webView.bounds;
            __block BOOL pdfFinished = NO;
            [webView createPDFWithConfiguration:pdfConfiguration
                              completionHandler:^(NSData *pdfData, NSError *error) {
                if (error) {
                    error_message = error.localizedDescription ?: @"Safari WebKit failed to create the PDF";
                } else if (!pdfData || ![pdfData writeToFile:pdfPath atomically:YES]) {
                    error_message = @"Safari WebKit failed to write the PDF file";
                } else {
                    success = YES;
                }
                pdfFinished = YES;
            }];

            NSDate *pdfDeadline = [NSDate dateWithTimeIntervalSinceNow:30.0];
            while (!pdfFinished && [pdfDeadline timeIntervalSinceNow] > 0) {
                [[NSRunLoop currentRunLoop]
                    runMode:NSDefaultRunLoopMode
                    beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
            }

            if (!pdfFinished && !error_message) {
                error_message = @"Safari WebKit timed out while creating the PDF";
            }

            [window orderOut:nil];
        }
    });

    if (!success) {
        lightmarkit_set_error(error_out, error_message ?: @"Safari WebKit PDF export failed");
    }
    return success;
}

void lightmarkit_free_error(char *error) {
    free(error);
}
