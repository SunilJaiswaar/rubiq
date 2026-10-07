/**
 * Headless smoke test against the built site, driven over the Chrome DevTools Protocol
 * with no extra dependencies. Verifies the app really boots, renders content, navigates,
 * runs code and persists progress in a real browser.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Node 22+ exposes WebSocket globally; Node 20 needs --experimental-websocket.
// Either way there is no dependency to install, which matters for a CI job.
if (typeof WebSocket === 'undefined') {
  console.error(
    '✖ No global WebSocket.\n' +
    '  Run on Node 22+, or on Node 20 with: node --experimental-websocket scripts/smoke.mjs\n',
  )
  process.exit(1)
}

const BASE = (process.argv[2] ?? 'http://localhost:4317').replace(/\/$/, '')

// A random port, so two runs on the same machine — or a leftover Chrome from a
// previous run — cannot collide on a fixed one.
const PORT = 9300 + Math.floor(Math.random() * 400)

// How long to wait for Chrome's debugging port. A cold CI runner is much slower
// than a warm laptop: the original 10 seconds was enough locally and produced
// intermittent "Chrome did not start" failures on GitHub's runners.
const STARTUP_TIMEOUT_MS = Number(process.env.CHROME_STARTUP_TIMEOUT_MS ?? 60_000)

const CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && existsSync(candidate))

if (!CHROME) {
  console.error('✖ No Chrome or Chromium found. Set CHROME_PATH to its location.\n')
  process.exit(1)
}

// A fresh profile per run. Reusing one meant a crashed previous run could leave a
// lock behind that makes the next Chrome refuse to start — which looks exactly like
// "Chrome did not start" and is maddening to diagnose.
const PROFILE = process.env.CHROME_PROFILE ?? mkdtempSync(path.join(tmpdir(), 'rubiq-smoke-'))

// stderr is captured rather than discarded, so a startup failure can report Chrome's
// own reason instead of a bare timeout.
const chromeLog = []
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  // /dev/shm is small in containers; without this Chrome can crash on startup.
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-crash-reporter',
  '--window-size=1280,900',
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

chrome.stderr?.on('data', (chunk) => {
  chromeLog.push(String(chunk))
  if (chromeLog.length > 40) chromeLog.shift()
})

let chromeExit = null
chrome.on('exit', (code, signal) => { chromeExit = signal ?? code })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cleanup = () => {
  try { chrome.kill('SIGKILL') } catch { /* already gone */ }
  if (!process.env.CHROME_PROFILE) {
    try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}
// A killed CI job must not leave a Chrome behind holding the port.
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

/** Poll Chrome's debugging port until it answers, or report why it never did. */
async function endpoint() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let lastError = ''

  while (Date.now() < deadline) {
    // If Chrome has already exited there is nothing to wait for.
    if (chromeExit !== null) {
      throw new Error(
        `Chrome exited (${chromeExit}) before opening its debugging port.\n` +
        `  binary: ${CHROME}\n` +
        (chromeLog.length ? `  stderr:\n${chromeLog.join('').trim().split('\n').slice(-8).map((l) => '    ' + l).join('\n')}` : '  (no stderr output)'),
      )
    }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const body = await res.json()
      if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl
      lastError = `no webSocketDebuggerUrl in ${JSON.stringify(body)}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }

  throw new Error(
    `Chrome did not open its debugging port within ${STARTUP_TIMEOUT_MS / 1000}s.\n` +
    `  binary: ${CHROME}\n  port:   ${PORT}\n  last:   ${lastError}\n` +
    (chromeLog.length ? `  stderr:\n${chromeLog.join('').trim().split('\n').slice(-8).map((l) => '    ' + l).join('\n')}` : ''),
  )
}

let id = 0
function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      events.push(msg)
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')))
  })
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  return { ws, send, ready, events }
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  const { send, ready, events } = connect(await endpoint())
  await ready

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const S = (m, p) => send(m, p, sessionId)

  await S('Page.enable')
  await S('Runtime.enable')
  await S('Log.enable')
  await S('Console.enable')

  const evaluate = async (expression) => {
    const r = await S('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'evaluation failed')
    }
    return r.result.value
  }

  const goto = async (path) => {
    await S('Page.navigate', { url: `${BASE}${path}` })
    await sleep(1400)
  }

  /* ---------------------------------------------------------- home page */
  await goto('/')
  check('home: h1 renders',
    (await evaluate('document.querySelector("h1")?.textContent ?? ""')).includes('software engineer'))
  check('home: react mounted',
    (await evaluate('document.querySelectorAll("#root *").length')) > 100,
    `${await evaluate('document.querySelectorAll("#root *").length')} nodes`)
  check('home: no console errors so far',
    !events.some((e) => e.method === 'Runtime.exceptionThrown'))
  check('home: track cards present',
    (await evaluate('document.body.innerText.includes("Ruby") && document.body.innerText.includes("SQL")')))

  /* ------------------------------------------------------------ theme */
  const bg = await evaluate('getComputedStyle(document.body).backgroundColor')
  check('theme: body background comes from a token', bg !== '' && bg !== 'rgba(0, 0, 0, 0)', bg)

  /* ----------------------------------------------------- lesson render */
  await goto('/learn/ruby/blocks-and-yield')
  await sleep(900)
  check('lesson: title renders',
    (await evaluate('document.querySelector("h1")?.textContent ?? ""')).includes('Blocks'))
  const blocks = await evaluate('document.querySelectorAll(".lesson-block").length')
  check('lesson: pedagogical blocks rendered', blocks > 5, `${blocks} blocks`)
  const highlighted = await evaluate('document.querySelectorAll("code.hljs").length')
  check('lesson: code is syntax-highlighted', highlighted > 3, `${highlighted} fences`)
  check('lesson: prose measure is constrained',
    (await evaluate('document.querySelector(".prose")?.getBoundingClientRect().width ?? 0')) < 760)

  /* -------------------------------------------------------- mode switch */
  await evaluate(`
    [...document.querySelectorAll('[role="radio"]')].find(b => /^Why$/i.test(b.textContent))?.click()
  `)
  await sleep(350)
  const whyActive = await evaluate(
    'document.querySelector(\'.lesson-block[data-block="why"]\')?.getAttribute("data-active")')
  const internalsActive = await evaluate(
    'document.querySelector(\'.lesson-block[data-block="internals"]\')?.getAttribute("data-active")')
  check('modes: WHY mode activates why blocks', whyActive === 'true')
  check('modes: WHY mode deactivates others', internalsActive === 'false')
  check('modes: dimmed content is still in the DOM',
    (await evaluate('document.querySelectorAll(".lesson-block").length')) === blocks)

  /* ---------------------------------------------------------- the quiz */
  await evaluate('document.getElementById("quiz")?.scrollIntoView()')
  await sleep(400)
  check('quiz: renders', (await evaluate('document.querySelectorAll(\'[role="radio"]\').length')) > 3)
  check('quiz: answer not revealed on arrival',
    !(await evaluate('document.body.innerText.includes("Correct")')))

  /* ------------------------------------------------- exercise + runner */
  await evaluate('document.getElementById("exercise")?.scrollIntoView()')
  await sleep(2500)  // Monaco loads lazily here
  const monacoLoaded = await evaluate('document.querySelectorAll(".monaco-editor").length > 0')
  check('exercise: Monaco loaded lazily on scroll', monacoLoaded)

  check('exercise: hints are hidden until asked for',
    (await evaluate('document.body.innerText.includes("Try it first")')))
  check('exercise: solution is locked before the tests pass',
    (await evaluate('document.body.innerText.includes("Unlocks once the tests pass")')))

  /* ------------------------------------------------------ SQL playground */
  await goto('/learn/sql/indexes')
  await sleep(1200)
  await evaluate('document.getElementById("lesson-playground")?.scrollIntoView()')
  await sleep(2200)
  check('sql: console rendered',
    (await evaluate('document.body.innerText.includes("rows examined") || document.body.innerText.includes("Run")')))
  check('sql: 100,000 rows generated in the browser',
    (await evaluate('document.body.innerText.includes("100,000")')),
    'seed expanded client-side')

  // Run a query and read the row count.
  // Scope to the lesson's SQL console — the prose also has Run buttons on its
  // runnable fences, and the first match would be one of those.
  await evaluate(`
    (() => {
      const pg = document.getElementById('lesson-playground');
      const run = [...(pg?.querySelectorAll('button') ?? [])]
        .find((b) => b.textContent.includes('Run'));
      run?.click();
      return Boolean(run);
    })()
  `)
  await sleep(1500)
  const scanned = await evaluate(
    String.raw`(document.body.innerText.match(/rows examined: ([\d,]+)/) || [])[1] ?? null`,
  )
  check('sql: query ran and reported rows examined', scanned !== null, `examined ${scanned}`)
  if (!scanned && process.env.SMOKE_DEBUG) {
    console.log('--- DEBUG: console buttons ---')
    console.log(await evaluate(`JSON.stringify([...(document.getElementById('lesson-playground')?.querySelectorAll('button') ?? [])].map((b) => b.textContent))`))
    console.log('--- DEBUG: playground section text ---')
    console.log(await evaluate(`document.getElementById('lesson-playground')?.innerText ?? 'NO SECTION'`))
  }

  // The signature interaction of the whole platform: toggle an index, re-run the
  // identical query, and watch the row count collapse.
  await evaluate(`
    (() => {
      const pg = document.getElementById('lesson-playground');
      const toggle = [...(pg?.querySelectorAll('button') ?? [])]
        .find((b) => b.textContent.startsWith('kind'));
      toggle?.click();
      return Boolean(toggle);
    })()
  `)
  await sleep(500)
  await evaluate(`
    (() => {
      const pg = document.getElementById('lesson-playground');
      [...(pg?.querySelectorAll('button') ?? [])]
        .find((b) => b.textContent.includes('Run'))?.click();
    })()
  `)
  await sleep(1500)
  const withIndex = await evaluate(
    String.raw`(document.body.innerText.match(/rows examined: ([\d,]+)/) || [])[1] ?? null`,
  )
  const before = Number(String(scanned).replace(/,/g, ''))
  const after = Number(String(withIndex).replace(/,/g, ''))
  check('sql: toggling an index collapses the rows examined',
    Number.isFinite(after) && after < before / 100,
    `${scanned} → ${withIndex}`)
  check('sql: the plan switches to an index scan',
    (await evaluate('document.body.innerText.includes("Index Scan")')))
  check('sql: the answer is unchanged — only the cost differs',
    (await evaluate('document.body.innerText.includes("1 row")')))

  // A fence's Run button should load the snippet AND run it — not make the learner
  // press Run again.
  await evaluate(`
    (() => {
      const fence = [...document.querySelectorAll('[data-run]')][0];
      fence?.click();
      return Boolean(fence);
    })()
  `)
  await sleep(1600)
  check('sql: a lesson code fence Run button executes the query',
    !(await evaluate('document.body.innerText.includes("Nothing run yet")')))

  /* -------------------------------------------------------- playground */
  await goto('/playground')
  await sleep(2500)
  await evaluate(`
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Run'))?.click()
  `)
  await sleep(1800)
  const output = await evaluate('document.body.innerText')
  check('playground: JS sandbox executed the starter code',
    output.includes('0,1,1,2,3,5') || /\b89\b/.test(output),
    'fibonacci output present')

  /* ------------------------------------------------------- navigation */
  await goto('/learn')
  check('catalog: lists lessons',
    (await evaluate('document.querySelectorAll(\'a[href*="/learn/"]\').length')) > 10)

  await goto('/roadmaps')
  check('roadmaps: renders', (await evaluate('document.body.innerText.includes("Backend Engineer")')))

  await goto('/review')
  await sleep(600)
  check('review: renders', (await evaluate('document.body.innerText.includes("Review")')))

  await goto('/progress')
  await sleep(800)
  check('progress: reflects the lessons visited in this session',
    (await evaluate('document.body.innerText.includes("opened")')))

  /* ---------------------------------------------------------- 404/SPA */
  await goto('/no/such/page')
  check('404: renders the not-found page', (await evaluate('document.body.innerText.includes("404")')))

  /* -------------------------------------------------- search palette */
  await goto('/search?q=index')
  await sleep(1500)
  check('search: finds results for "index"',
    (await evaluate('document.querySelectorAll(\'a[href*="/learn/"]\').length')) > 0,
    `${await evaluate('document.querySelectorAll(\'a[href*="/learn/"]\').length')} hits`)
  check('search: explains why a result matched',
    (await evaluate('document.body.innerText.includes("matched")')))

  /* ----------------------------------------------------- persistence */
  const stored = await evaluate(`
    new Promise((resolve) => {
      const req = indexedDB.open('rubiq', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readonly');
        const all = tx.objectStore('kv').getAllKeys();
        all.onsuccess = () => resolve(all.result.map(String));
        all.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
      setTimeout(() => resolve([]), 2000);
    })
  `)
  check('storage: progress written to IndexedDB',
    Array.isArray(stored) && stored.some((k) => k.startsWith('progress:lesson:')),
    `${stored.length} keys`)
  check('storage: concepts enrolled for spaced review',
    Array.isArray(stored) && stored.some((k) => k.startsWith('srs:')))

  /* ------------------------------------- Monaco's TypeScript worker */
  // The worker import specifiers are version-sensitive — monaco 0.57 changed them —
  // and a broken one fails silently: the editor still renders, it just has no
  // language service. So this switches to TypeScript, waits for the worker, and
  // checks both that it answered and that the code still executes.
  await goto('/playground')
  await sleep(2500)
  await evaluate(`
    [...document.querySelectorAll('[role=tab]')]
      .find((b) => b.textContent.trim() === 'TypeScript')?.click()
  `)
  await sleep(3500)

  check('typescript: Monaco mounted for the TS tab',
    (await evaluate('document.querySelectorAll(".monaco-editor").length > 0')))

  // A language service that is alive decorates the model; a dead worker leaves none
  // and logs a worker-load failure, which the no-console-error check below catches.
  const tsWorkerLoaded = await evaluate(`
    performance.getEntriesByType('resource')
      .some((r) => /ts\.worker/.test(r.name))
  `)
  check('typescript: the ts.worker chunk was fetched', tsWorkerLoaded === true)

  await evaluate(`
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Run'))?.click()
  `)
  await sleep(2000)
  check('typescript: the TS starter transpiles and runs',
    (await evaluate('document.body.innerText')).includes('5'),
    'distance({0,0},{3,4}) = 5')

  /* ------------------------------------------------- dark mode */
  await goto('/')
  await evaluate(`
    (() => {
      try { localStorage.setItem('rubiq:theme', 'dark') } catch (e) {}
    })()
  `)
  await goto('/learn/ruby/blocks-and-yield')
  await sleep(900)
  const darkBg = await evaluate('getComputedStyle(document.body).backgroundColor')
  check('dark mode: body background switches', darkBg === 'rgb(15, 17, 21)', darkBg)
  const darkInk = await evaluate(
    'getComputedStyle(document.querySelector(".prose p")).color')
  check('dark mode: prose text is light, not left dark-on-dark',
    /^rgb\((2[0-9]{2}|1[89][0-9])/.test(String(darkInk)), String(darkInk))
  check('dark mode: pedagogical blocks still render',
    (await evaluate('document.querySelectorAll(".lesson-block").length')) > 5)
  check('dark mode: the html element carries the class the tokens key off',
    (await evaluate('document.documentElement.classList.contains("dark")')))

  // Back to light for the remaining checks.
  await evaluate(`(() => { try { localStorage.removeItem('rubiq:theme') } catch (e) {} })()`)

  /* ------------------------------------------------- responsive layout */
  await S('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 667, deviceScaleFactor: 2, mobile: true,
  })
  await goto('/learn/ruby/blocks-and-yield')
  await sleep(1200)

  const overflow = await evaluate(`
    (() => {
      const docWidth = document.documentElement.clientWidth;
      // Anything wider than the viewport forces a horizontal page scroll, which is
      // the single most common responsive failure.
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().width > docWidth + 1)
        .map((el) => el.tagName + '.' + (el.className?.toString?.().slice(0, 40) ?? ''));
      return { scrollWidth: document.documentElement.scrollWidth, docWidth, offenders: offenders.slice(0, 5) };
    })()
  `)
  // Elements wider than the viewport are fine *if* they sit inside a scrolling box —
  // which is what the code-block and table wrappers do. Only a page-level overflow is
  // a failure, so the offender list is reported only when the check actually fails.
  const pageOverflows = overflow.scrollWidth > overflow.docWidth + 1
  check('mobile 375px: no horizontal page scroll',
    !pageOverflows,
    pageOverflows
      ? `scrollWidth ${overflow.scrollWidth} vs ${overflow.docWidth} — ${overflow.offenders.join(', ')}`
      : `${overflow.docWidth}px viewport, nothing escapes it`)

  check('mobile 375px: lesson content is readable',
    (await evaluate('document.querySelectorAll(".lesson-block").length')) > 5)

  check('mobile 375px: the sidebar is hidden rather than squeezed',
    (await evaluate(`
      (() => {
        const aside = document.querySelector('aside');
        return !aside || getComputedStyle(aside).display === 'none' ||
               aside.getBoundingClientRect().width === 0;
      })()
    `)))

  check('mobile 375px: a side gutter is preserved',
    (await evaluate(`
      (() => {
        const h1 = document.querySelector('h1');
        return h1 ? h1.getBoundingClientRect().left >= 14 : false;
      })()
    `)))

  // Code blocks must scroll inside their own box, not push the page wide.
  check('mobile 375px: code blocks scroll internally',
    (await evaluate(`
      (() => {
        const pre = document.querySelector('.code__pre');
        if (!pre) return false;
        return getComputedStyle(pre).overflowX === 'auto' &&
               pre.getBoundingClientRect().width <= document.documentElement.clientWidth;
      })()
    `)))

  check('mobile 375px: the menu button is available',
    (await evaluate(`
      Boolean([...document.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === 'Menu'))
    `)))

  await S('Emulation.clearDeviceMetricsOverride')

  /* --------------------------------------------------- keyboard access */
  await goto('/')
  await sleep(600)

  // `/` must open the command palette.
  await S('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', text: '/' })
  await S('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash' })
  await sleep(600)
  check('keyboard: "/" opens the search palette',
    (await evaluate('Boolean(document.querySelector(\'[role="dialog"]\'))')))
  check('keyboard: focus lands in the search input',
    (await evaluate('document.activeElement?.getAttribute("aria-label") === "Search"')))

  await S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await sleep(400)
  check('keyboard: Escape closes it',
    !(await evaluate('Boolean(document.querySelector(\'[role="dialog"]\'))')))

  check('a11y: a skip link is the first focusable element',
    (await evaluate(`
      (() => {
        const first = document.querySelector('a[href="#main"]');
        return Boolean(first) && first.textContent.toLowerCase().includes('skip');
      })()
    `)))

  check('a11y: landmarks are present',
    (await evaluate(`
      Boolean(document.querySelector('header') && document.querySelector('main#main') &&
              document.querySelector('footer') && document.querySelector('nav[aria-label]'))
    `)))

  /* ------------------------------------------------- errors collected */
  const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown')
  const consoleErrors = events.filter(
    (e) => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error',
  )
  check('no uncaught exceptions across the whole run', exceptions.length === 0,
    exceptions.map((e) => e.params.exceptionDetails?.exception?.description?.split('\n')[0]).join(' | '))
  check('no console.error across the whole run', consoleErrors.length === 0,
    consoleErrors.map((e) => e.params.args?.[0]?.value).join(' | '))

} catch (error) {
  console.error('\nHARNESS ERROR:', error.message)
  results.push({ name: 'harness', ok: false, detail: error.message })
} finally {
  cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
