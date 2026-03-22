"""
Serves the client-side error reporter JavaScript snippet.

GET /v1/errors/reporter.js  - returns a tiny JS script that catches
    window.onerror and unhandledrejection, then POSTs to /v1/errors/report.

Usage in any HTML page:
  <script src="https://api.recoder.xyz/v1/errors/reporter.js?app=recoder-web"></script>
"""

from fastapi import APIRouter, Query
from fastapi.responses import Response

router = APIRouter(tags=["client-errors"])

_JS_TEMPLATE = r"""
(function() {
  "use strict";
  var ENDPOINT = "%%ENDPOINT%%";
  var APP = "%%APP%%";
  var _queue = [];
  var _sending = false;
  var _reported = new Set();

  function _hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }

  function _send(payload) {
    var key = _hash(payload.error + (payload.url || ""));
    if (_reported.has(key)) return;
    if (_reported.size > 200) _reported.clear();
    _reported.add(key);

    _queue.push(payload);
    _flush();
  }

  function _flush() {
    if (_sending || _queue.length === 0) return;
    _sending = true;
    var item = _queue.shift();
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", ENDPOINT, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onloadend = function() { _sending = false; _flush(); };
      xhr.onerror = function() { _sending = false; };
      xhr.timeout = 5000;
      xhr.send(JSON.stringify(item));
    } catch(e) {
      _sending = false;
    }
  }

  var _origOnerror = window.onerror;
  window.onerror = function(msg, source, lineno, colno, error) {
    _send({
      app: APP,
      error: String(msg),
      stack: error && error.stack ? error.stack.substring(0, 8192) : (source + ":" + lineno + ":" + colno),
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      metadata: { type: "onerror", source: source, line: lineno, col: colno }
    });
    if (_origOnerror) return _origOnerror.apply(this, arguments);
  };

  window.addEventListener("unhandledrejection", function(event) {
    var reason = event.reason;
    var msg = "Unhandled Promise Rejection";
    var stack = "";
    if (reason instanceof Error) {
      msg = reason.message || msg;
      stack = reason.stack || "";
    } else if (typeof reason === "string") {
      msg = reason;
    } else {
      try { msg = JSON.stringify(reason).substring(0, 1024); } catch(e) {}
    }
    _send({
      app: APP,
      error: msg,
      stack: stack.substring(0, 8192),
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      metadata: { type: "unhandledrejection" }
    });
  });

  window.__recoderReportError = function(error, extra) {
    var msg = "", stack = "";
    if (error instanceof Error) {
      msg = error.message; stack = error.stack || "";
    } else {
      msg = String(error);
    }
    _send({
      app: APP,
      error: msg,
      stack: stack.substring(0, 8192),
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      metadata: Object.assign({ type: "manual" }, extra || {})
    });
  };

  var _origConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a) {
      if (a instanceof Error) return a.message;
      if (typeof a === "string") return a;
      try { return JSON.stringify(a).substring(0, 512); } catch(e) { return String(a); }
    }).join(" ");
    if (msg.length > 10 && (msg.indexOf("Error") !== -1 || msg.indexOf("error") !== -1 || msg.indexOf("fail") !== -1 || msg.indexOf("Fail") !== -1)) {
      var stack = "";
      for (var i = 0; i < args.length; i++) {
        if (args[i] instanceof Error && args[i].stack) { stack = args[i].stack; break; }
      }
      _send({
        app: APP,
        error: msg.substring(0, 4096),
        stack: stack.substring(0, 8192),
        url: location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        metadata: { type: "console.error" }
      });
    }
    return _origConsoleError.apply(console, arguments);
  };
})();
"""


@router.get("/errors/reporter.js", summary="Client-side error reporter script")
async def get_reporter_script(
    app: str = Query("unknown", description="App name for tagging errors"),
    endpoint: str = Query(
        "https://api.recoder.xyz/v1/errors/report",
        description="Error report endpoint URL",
    ),
):
    js = _JS_TEMPLATE.replace("%%ENDPOINT%%", endpoint).replace("%%APP%%", app)
    return Response(
        content=js,
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        },
    )
