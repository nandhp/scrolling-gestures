//
// The main module of the Scrolling Gestures Add-on.
// Copyright (C) 2013 nandhp <nandhp@gmail.com>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.
//

// Required modules
var windows = require('window/utils');
var highwindows = require('sdk/windows');
var self = require("sdk/self");
var prefs = require('sdk/simple-prefs');

// Global variables
var gWindowId = 0;          // Global window counter for unique IDs
var debug = 1;              // Debug level: 0, 1, 2, 3.
var reportedScroll = 0;
var reportedScrollValid = 0;

// Data about the gesture currently being recognized
var eventWindow = 0;
var eventTime = 0;
var eventDirection = 0;
var eventLength = 0;
var eventScrollPos = new Array();
var eventReportedScroll = 0;
var eventLocked = false;
var eventDrift = 0;

// Gesture configuration
var gestureTimeout = 100;
var gestureLength = 11;
var gestureUnlockTimeout = 100;
var gestureReverse = 1;         // -1 = Reverse, 1 = Not reversed
var gestureFeedback = 1;

// In-page workers for visual feedback
var workerCache = undefined;
var workers = new Array();
// Find the current worker object for a given tab.
function workerForTab(tab) {
    // Check cache first to avoid traversing the list of workers
    try {
        if ( workerCache.tab === tab ) {
            workerCache.port.emit('donothing');
            return workerCache;
        }
    }
    catch (e) { }
    workerCache = undefined;

    // Look for the worker that belongs to this tab
    for ( var i=0; i < workers.length; i++ ) {
        if ( workers[i].tab === tab ) {
            // WARNING/BUG: Workers aren't immediately detached during forward
            // and back, but are kept around for a while (for fastback?)
            try { workers[i].port.emit('donothing') } // Is it alive?
            catch (e) { continue }
            workerCache = workers[i];
            break;
        }
    }
    return workerCache;
}
// Add a worker to the tab
function attachWorker(tab) {
    var worker = tab.attach({
        contentScriptFile: self.data.url('pagemod.js')
    });
    workers.push(worker);
    if ( debug > 1 )
        console.log("Adding worker for " + worker.url + " " +
                    "; now " + workers.length + " workers.")
    worker.on('detach', function () { detachWorker(this) });
    worker.port.on('reportScroll', function(pos) {
        // Inner scrollables (overflow:scroll), including pdf.js, are not
        // directly accessible; have the worker report on these for us.
        reportedScroll = pos;
        if ( !reportedScrollValid )
            reportedScrollValid = 1;
    });
    return worker;
}
// A worker has been detached; remove it from our list.
function detachWorker(worker) {
    if ( worker === workerCache )
        workerCache = undefined;
    var index = workers.indexOf(worker);
    if ( index != -1 )
        workers.splice(index, 1);
    if ( debug > 1 )
        console.log('Detaching worker, got index ' + index +
                    '; now ' + workers.length + ' workers')
}

// Try to recognize a back/forward gesture
function recognizeGesture(event, wnd) {
    if ( debug > 2 )
        console.log("Scroll: x=" + event.deltaX + ", y=" + event.deltaY +
                    ", z=" + event.deltaZ);
    var now = new Date().getTime();
    var amount = event.deltaX;
    if ( amount == 0 ) {
        // Set eventLocked if we do too much vertical motion.
        // (too much if net vertical motion is ever at half of gestureLength)
        amount = event.deltaY > 0 ? 1 : -1;
        if ( now-eventTime >= gestureTimeout ) eventDrift = 0;
        eventDrift += amount;
        if ( Math.abs(eventDrift) >= gestureLength/2 ) eventLocked = true;
        if ( debug > 2 )
            console.log("eventDrift = " + eventDrift + "(" + eventLocked + "," + eventLength + ")");
        eventTime = now;
        return; // Ignore inadvertant y-motion
    }
    else amount = amount > 0 ? 1 : -1;

    // Do not repeat the gesture due to inertial scrolling
    if ( eventLocked && amount == eventDirection &&
         now-eventTime < gestureUnlockTimeout ) {
        eventTime = now;
        return;
    }
    var isValid = amount == eventDirection && now-eventTime < gestureTimeout &&
         wnd._scroll_gestures_id == eventWindow;
    // If the window scroll position changed, we cancel the gesture
    var nowScroll = new Array();
    var frames = windows.getFrames(wnd);
    for ( var i = 0; i < frames.length; i++ )
        nowScroll[i] = frames[i].scrollX;
    if ( nowScroll.length != eventScrollPos.length )
        isValid = false;
    if ( isValid ) {
        for ( var i = 0; i < frames.length; i++ ) {
            if ( nowScroll[i] != eventScrollPos[i] )
                isValid = false;
        }
        // Check other scrollable items not directly accessible.
        if ( debug > 1 )
            console.log("Reported scroll: " + reportedScroll + " " +
                        eventReportedScroll + " " + reportedScrollValid);
        if ( reportedScrollValid > 1 && reportedScroll != eventReportedScroll )
            isValid = false;
        if ( !isValid ) {
            // We're scrolling, so lock the gesture until we stop.
            eventLocked = true;
            return;
        }
    }
    // Begin a new gesture if the old one is invalid
    if ( !isValid ) {
        eventWindow = wnd._scroll_gestures_id;
        eventLength = 0;
        eventScrollPos = nowScroll;
        eventDirection = amount;
        reportedScrollValid = 0;
        eventDrift = 0;
    }
    // We have a scroll report from the worker, enable use of it.
    if ( reportedScrollValid == 1 ) {
        eventReportedScroll = reportedScroll;
        reportedScrollValid = 2;
    }
    // Update the status of the gesture
    eventLocked = false;
    eventLength++;
    eventTime = now;

    // Get the active tab for the window being scrolled
    var highwnd = highwindows.BrowserWindow({window: wnd});
    var tab = highwnd.tabs.activeTab;

    // Update gesture status display
    try {
        var worker = workerForTab(tab);
        if ( !worker ) worker = attachWorker(tab);
        worker.port.emit("setStatus", eventDirection*gestureReverse,
                         gestureFeedback ? eventLength/gestureLength : 0,
                         gestureTimeout);
    }
    catch (e) {
        if ( debug )
            console.warn("Error displaying gesture status: " + e);
    }
    
    // The gesture is completed
    if ( eventLength >= gestureLength ) {
        if ( debug )
            console.log("Triggered gesture " + eventDirection);
        // Send a history navigation event to the tab
        tab.attach({
            contentScript: 'history.go(' + eventDirection*gestureReverse + ')'
        });
        // Invalidate the current gesture
        eventWindow = 0;
        eventLocked = true;
    }
    // Update the status of the gesture
    else if ( debug > 1 )
        console.log("Gesture " + eventDirection + ": " + eventLength + "/" + gestureLength);
    return;
}

// Attach to a window. Install a detach handler we can call later.
function attach(wnd) {
    // This only works for browser windows, not e.g. the error console.
    if ( !wnd.gBrowser ) {
        // WARNING/BUG: windows.isBrowser(wnd) is false for private windows.
        if ( debug )
            console.log("[Skipping a non-browser window]");
        return;
    }
    // Do not attach to a window multiple times.
    if ( wnd._scroll_gestures_id )
        return;
    // Let us assign a unique ID number to each window.
    gWindowId++;
    var windowid = gWindowId;
    if ( debug )
        console.log("Attaching to window " + windowid);
    // Our event handler functions and extra window properties.
    function myhandler(event) { return recognizeGesture(event, wnd) }
    wnd._scroll_gestures_id = gWindowId;
    wnd._scroll_gestures_detach = function () {
        if ( !wnd._scroll_gestures_id )
            return;
        if ( debug )
            console.log("Detaching from window " + windowid);
        // Reset everything
        wnd._scroll_gestures_id = 0;
        wnd._scroll_gestures_detach = undefined;
        wnd.gBrowser.mPanelContainer.removeEventListener("wheel", myhandler)
    }
    // Install our event handler into onscroll.
    wnd.gBrowser.mPanelContainer.addEventListener("wheel", myhandler)
}

// Try to call the detach handler that was previously attached to the window.
function detach(wnd) {
    try {
        wnd._scroll_gestures_detach();
    }
    catch(e) {
        console.error("Failed to detach from window: "+ e)
        console.error("Window was " + wnd._scroll_gestures_id);
    }
}

// Attach or detach to all windows.
function doAllWindows(func) {
    var wnds = windows.windows('navigator:browser', {includePrivate: true});
    if ( debug )
        console.log("Operating on " + wnds.length + " windows.")
    for (var i = 0; i < wnds.length; i++)
        func(wnds[i]);
}

// https://groups.google.com/forum/#!msg/mozilla-labs-jetpack/F1scPBoCCVU/jVnJyL1KxBYJ
function getChromeWindow(sdkWindow) {
    var winlist = windows.windows('navigator:browser', {includePrivate: true});
    for (let window of winlist)
        if (highwindows.BrowserWindow({window: window}) === sdkWindow)
        return window;
    return null;
} 

// Load preferences
function updatePrefs() {
    gestureTimeout = prefs.prefs.gestureTimeout;
    gestureLength = prefs.prefs.gestureLength;
    gestureUnlockTimeout = prefs.prefs.gestureUnlockTimeout;
    gestureReverse = prefs.prefs.gestureReverse;
    gestureFeedback = prefs.prefs.gestureFeedback;
    console.log("Prefs updated: " + gestureTimeout + " " + gestureLength +
                " " + gestureUnlockTimeout + " " + gestureReverse +
                " " + gestureFeedback);
}

exports.main = function() {
    // Handle preferences
    prefs.on("", updatePrefs);
    updatePrefs();

    // Automatically attach to newly created windows
    highwindows.browserWindows.on('open', function (wnd) {
        attach(getChromeWindow(wnd));
    });
    // Attach to all existing windows
    doAllWindows(attach);
};

// Detach from all windows before unloading
exports.onUnload = function() {
    doAllWindows(detach);
};
