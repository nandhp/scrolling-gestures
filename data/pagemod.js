//
// In-page script of the Scrolling Gestures Add-on.
// Copyright (C) 2013 nandhp <nandhp@gmail.com>
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.
//

var frame, doc;
var item, text;
var TAGNAME = 'scrolling-gestures-feedback';

// If page has frames, display our indicator in the largest frame.
function findFrame(wnd) {
    if ( !wnd.document.body ) return wnd;
    if ( wnd.document.body.tagName.toLowerCase() == "body" ) return wnd;
    while ( wnd.frames.length > 0 ) {
        var best = -1;
        var bestArea = 0;
        for ( var i = 0; i < wnd.frames.length; i++ ) {
            var area = 0;
            try { area = wnd.frames[i].innerWidth*wnd.frames[i].innerHeight }
            catch (e) { area = 0 }
            if ( area <= bestArea ) continue;
            best = i; bestArea = area;
        }
        if ( best == -1 ) break; // No accessible frames
        wnd = wnd.frames[best];
    }
    return wnd;
}

// Create an element in the page for visual feedback.
function createElem() {
    try { resetStatus() }
    catch (e) { }
    frame = findFrame(window);
    doc = frame.document;
    item = doc.createElement(TAGNAME);
    text = doc.createTextNode('Scrolling Gestures - Error');
    item.appendChild(text)
    item.style.position = 'fixed';
    item.style.fontFamily = 'sans-serif';
    item.style.fontSize = '48px';
    item.style.top = '48px';
    item.style.textAlign = 'center';
    item.style.width = '100px';
    item.style.lineHeight = '64px';
    item.style.background = 'black';
    item.style.color = 'white';
    item.style.opacity = 0.75;
    item.style.borderRadius = '5px';
    item.style.left = '0';
    item.style.zIndex = 19999;
}
var inserted = false;
var resetTimeout = undefined;

// Provide gesture progress feedback.
// Also, report scrolling position.
self.port.on("setStatus", function(direction, progress, resetTime) {
    if ( progress >= 0.5 ) {
        if ( !inserted )
            createElem();
        text.nodeValue = direction < 0 ? '\u2190' : '\u2192'; // L/R arrows
        progress = 0.5*(1-progress);
        if ( direction < 0 ) {
            item.style.right = ''; item.style.left = (100*progress)+"%";
        }
        else {
            item.style.left = ''; item.style.right = (100*progress)+"%";
        }
        //item.style.opacity = 0.75-2*progress;
        item.style.display = 'block';
        if ( resetTimeout )
            clearTimeout(resetTimeout);
        resetTimeout = setTimeout(function() { resetStatus() }, resetTime);
        if ( !inserted )
            try {
                doc.body.appendChild(item);
                inserted = true;
            }
            catch (e) {
                /* Do not spam the error log if it doesn't work */
            }
    }
    // Report scrolling position; scrolling of page elements (overflow:auto),
    // including pdf.js, can only be detected this way.
    try {
        var o = doc.getElementsByTagName('*');
        var total = 0;
        for ( var i=0; i < o.length; i++ ) total += o[i].scrollLeft;
        self.port.emit("reportScroll", total);
    }
    catch (e) { }
});

// Remove the gesture progress indication
function resetStatus() {
    if ( resetTimeout )
        clearTimeout(resetTimeout);
    resetTimeout = undefined;
    if ( item && item.parentNode )
        item.parentNode.removeChild(item);
    inserted = false;
    cleanObsolete();
}
self.port.on("hideStatus", function() { resetStatus() });
document.addEventListener('pagehide', function() { resetStatus() });

function cleanObsolete() {
    try {
        var o = doc.getElementsByTagName(TAGNAME);
        for ( var i = 0; i < o.length; i++ ) {
            o[i].style.display = 'none';
        }
    }
    catch (e) { console.warn("Failed to clean obsolete " + TAGNAME + ": " + e) }
}
