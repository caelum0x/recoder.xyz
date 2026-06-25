// platform — OS-aware capture-backend selection. Tests use injected fake exec + fake timer:
// no real OS, screen, or process touched. Asserts routing, Linux/Windows CaptureEvent emission,
// dedup of unchanged frames, missing-tool degradation, and the pure command/parse helpers.
import {
  detectPlatform, selectCaptureBackend, normalizeOcr,
  linuxCapture, buildLinuxCmds, parseSwayTree, shotCandidates,
  windowsCapture, buildWindowsCmds, parseWindowsActive,
} from './platform.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}  ${x}`); } };

// A controllable fake timer: captures the poll fn so the test ticks it deterministically.
function fakeTimer() {
  const state = { fn: null, cleared: false };
  return {
    state,
    setTimer: (fn) => { state.fn = fn; return 1; },
    clearTimer: () => { state.cleared = true; },
    tick: () => state.fn && state.fn(),
  };
}

console.log('\nplatform (OS-aware capture backend)\n');

// ---------- detectPlatform routing ----------
ok('detect darwin', detectPlatform({ platform: 'darwin' }) === 'darwin');
ok('detect linux', detectPlatform({ platform: 'linux' }) === 'linux');
ok('detect win32', detectPlatform({ platform: 'win32' }) === 'win32');
ok('detect unknown (freebsd/aix/etc.)', detectPlatform({ platform: 'freebsd' }) === 'unknown');
ok('detect defaults to node process.platform', typeof detectPlatform() === 'string');

// ---------- selectCaptureBackend routing ----------
const mac = selectCaptureBackend('darwin');
ok('darwin → native swift, no JS start (helper not reimplemented)', mac.kind === 'native-swift' && mac.native === true && mac.start === null && mac.helper === 'screen');
const lin = selectCaptureBackend('linux');
ok('linux → linuxCapture backend', lin.kind === 'linux' && lin.start === linuxCapture && lin.source === 'ocr');
const win = selectCaptureBackend('win32');
ok('win32 → windowsCapture backend', win.kind === 'windows' && win.start === windowsCapture);
const unk = selectCaptureBackend('plan9');
ok('unknown → no backend', unk.kind === 'none' && unk.start === null && unk.source === null);

// ---------- normalizeOcr ----------
ok('normalizeOcr trims + collapses blank runs', normalizeOcr('  a  \n\n\n\nb  \n') === 'a\n\nb');
ok('normalizeOcr empty → empty', normalizeOcr('   \n  \r\n ') === '');

// ---------- buildLinuxCmds / shotCandidates ----------
const x11cmds = buildLinuxCmds('x11', { tmpFile: '/t/f.png' });
ok('x11 cmds use xdotool name+class + tesseract', x11cmds.activeName.cmd === 'xdotool'
  && x11cmds.activeName.args.join(' ') === 'getactivewindow getwindowname'
  && x11cmds.activeClass.args.join(' ') === 'getactivewindow getwindowclassname'
  && x11cmds.ocr.cmd === 'tesseract' && x11cmds.ocr.args[0] === '/t/f.png');
const wlcmds = buildLinuxCmds('wayland', { tmpFile: '/t/f.png' });
ok('wayland cmds use swaymsg get_tree + grim', wlcmds.tree.cmd === 'swaymsg'
  && wlcmds.tree.args.join(' ') === '-t get_tree' && wlcmds.shot.cmd === 'grim');
ok('shotCandidates: wayland=grim, x11=maim,scrot', shotCandidates('wayland').join() === 'grim' && shotCandidates('x11').join() === 'maim,scrot');

// ---------- parseSwayTree ----------
const tree = JSON.stringify({
  id: 1, nodes: [
    { id: 2, focused: false, app_id: 'firefox', name: 'bg' },
    { id: 3, nodes: [{ id: 9, focused: true, app_id: 'Code', name: 'platform.mjs — continuum' }] },
  ],
});
const f = parseSwayTree(tree);
ok('parseSwayTree finds focused node', f && f.app === 'Code' && f.title === 'platform.mjs — continuum' && f.id === '9');
ok('parseSwayTree window_properties.class fallback', parseSwayTree({ focused: true, window_properties: { class: 'Gimp' }, name: 'x' }).app === 'Gimp');
ok('parseSwayTree no focus → null', parseSwayTree({ id: 1, nodes: [{ id: 2, focused: false }] }) === null);
ok('parseSwayTree bad json → null', parseSwayTree('{not json') === null);

// ---------- LINUX X11 emit: canned active-window + ocr → CaptureEvent ----------
{
  let ocrOut = 'Recoder roadmap\nShip the linux backend';
  const fakeExec = (cmd, args) => {
    if (cmd === 'xdotool') {
      const a = args.join(' ');
      if (a === 'getactivewindow') return '54525953\n';
      if (a.endsWith('getwindowname')) return 'roadmap.md — Code\n';
      if (a.endsWith('getwindowclassname')) return 'Code\n';
    }
    if (cmd === 'maim') return '';                 // screenshot writes file
    if (cmd === 'tesseract') return ocrOut;        // OCR text
    throw new Error(`unexpected ${cmd}`);
  };
  const events = [];
  const tm = fakeTimer();
  const stop = linuxCapture((e) => events.push(e), {
    exec: fakeExec, session: 'x11', now: () => 1111, setTimer: tm.setTimer, clearTimer: tm.clearTimer,
  });

  const e0 = events[0];
  ok('x11 emits one CaptureEvent on first poll', events.length === 1);
  ok('x11 event has the ocr contract shape', e0 && e0.source === 'ocr' && e0.app === 'Code'
    && e0.title === 'roadmap.md — Code' && e0.window_id === 'Code|54525953'
    && e0.t === 1111 && /linux backend/.test(e0.text));

  // dedup: same frame on the next tick → no new event
  tm.tick();
  ok('x11 dedups unchanged frame', events.length === 1);

  // changed OCR → new event
  ocrOut = 'Recoder roadmap\nNow OCR changed';
  tm.tick();
  ok('x11 emits again when frame text changes', events.length === 2 && /OCR changed/.test(events[1].text));

  stop();
  ok('x11 stop() clears the timer + halts polling', tm.state.cleared === true);
  tm.tick();
  ok('x11 no emit after stop', events.length === 2);
}

// ---------- LINUX degrade: a missing tool throws → emit nothing, never throw ----------
{
  const events = [];
  const throwingExec = (cmd) => { throw new Error(`${cmd}: command not found`); };  // xdotool missing
  let threw = false;
  const tm = fakeTimer();
  try {
    const stop = linuxCapture((e) => events.push(e), { exec: throwingExec, session: 'x11', setTimer: tm.setTimer, clearTimer: tm.clearTimer });
    tm.tick();
    stop();
  } catch { threw = true; }
  ok('linux degrades on missing tool (no throw, no events)', threw === false && events.length === 0);
}

// ---------- LINUX degrade: window ok but no screenshot tool → no event ----------
{
  const events = [];
  const exec = (cmd, args) => {
    if (cmd === 'xdotool') { const a = args.join(' '); return a.endsWith('getwindowname') ? 'T' : a.endsWith('getwindowclassname') ? 'App' : '7'; }
    if (cmd === 'maim' || cmd === 'scrot') throw new Error('not installed');  // both screenshot tools missing
    if (cmd === 'tesseract') return 'should never reach OCR';
    return '';
  };
  const tm = fakeTimer();
  linuxCapture((e) => events.push(e), { exec, session: 'x11', setTimer: tm.setTimer, clearTimer: tm.clearTimer });
  ok('linux degrades when no screenshot tool available', events.length === 0);
}

// ---------- LINUX Wayland emit ----------
{
  const exec = (cmd) => {
    if (cmd === 'swaymsg') return tree;       // focused node = Code (from tree above)
    if (cmd === 'grim') return '';
    if (cmd === 'tesseract') return 'wayland captured text';
    throw new Error(cmd);
  };
  const events = [];
  const tm = fakeTimer();
  linuxCapture((e) => events.push(e), { exec, session: 'wayland', now: () => 5, setTimer: tm.setTimer, clearTimer: tm.clearTimer });
  ok('wayland emits CaptureEvent from sway tree + ocr', events.length === 1
    && events[0].app === 'Code' && events[0].window_id === 'Code|9' && events[0].text === 'wayland captured text' && events[0].source === 'ocr');
}

// ---------- WINDOWS command construction ----------
const wcmds = buildWindowsCmds({ tmpFile: 'C:/t/f.png', ocrTool: 'tesseract' });
ok('windows active probe is a powershell command', wcmds.active.cmd === 'powershell'
  && wcmds.active.args.includes('-Command') && /GetForegroundWindow/.test(wcmds.active.args.at(-1)));
ok('windows shot is powershell + CopyFromScreen + tmpFile', wcmds.shot.cmd === 'powershell'
  && /CopyFromScreen/.test(wcmds.shot.args.at(-1)) && wcmds.shot.args.at(-1).includes('C:/t/f.png'));
ok('windows ocrTool=tesseract → tesseract cmd', wcmds.ocr.cmd === 'tesseract' && wcmds.ocr.args[0] === 'C:/t/f.png');
ok('windows default ocrTool → Windows.Media.Ocr powershell', /Windows\.Media\.Ocr|OcrEngine/.test(buildWindowsCmds({ tmpFile: 'x' }).ocr.args.at(-1)));

// ---------- parseWindowsActive ----------
ok('parseWindowsActive JSON', (() => { const w = parseWindowsActive('{"app":"chrome","title":"Recoder","id":"131072"}'); return w.app === 'chrome' && w.title === 'Recoder' && w.window_id === 'chrome|131072'; })());
ok('parseWindowsActive pipe fallback', (() => { const w = parseWindowsActive('Code|main.ts|99'); return w.app === 'Code' && w.window_id === 'Code|99'; })());
ok('parseWindowsActive empty → null', parseWindowsActive('   ') === null);

// ---------- WINDOWS emit + dedup ----------
{
  let ocr = 'first window contents';
  const exec = (cmd, args) => {
    const tail = args.at(-1) || '';
    if (cmd === 'powershell' && /GetForegroundWindow/.test(tail)) return '{"app":"explorer","title":"Docs","id":"4242"}';
    if (cmd === 'powershell' && /CopyFromScreen/.test(tail)) return '';        // screenshot ok
    if (cmd === 'powershell' && /OcrEngine/.test(tail)) return ocr;            // OCR
    throw new Error('unexpected');
  };
  const events = [];
  const tm = fakeTimer();
  windowsCapture((e) => events.push(e), { exec, now: () => 9, setTimer: tm.setTimer, clearTimer: tm.clearTimer });
  ok('windows emits CaptureEvent', events.length === 1 && events[0].app === 'explorer'
    && events[0].window_id === 'explorer|4242' && events[0].source === 'ocr' && /first window/.test(events[0].text));
  tm.tick();
  ok('windows dedups unchanged frame', events.length === 1);
  ocr = 'second contents';
  tm.tick();
  ok('windows emits again on change', events.length === 2);
}

// ---------- WINDOWS degrade ----------
{
  const events = [];
  let threw = false;
  const tm = fakeTimer();
  try {
    windowsCapture((e) => events.push(e), { exec: () => { throw new Error('powershell missing'); }, setTimer: tm.setTimer, clearTimer: tm.clearTimer });
  } catch { threw = true; }
  ok('windows degrades when powershell is missing', threw === false && events.length === 0);
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
