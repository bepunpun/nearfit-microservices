const DAY_TOKENS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MINUTES_PER_DAY = 1440;

const DAYS_SPEC = "[A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*";
const TIME_RANGE = "\\d{1,2}:\\d{2}-\\d{1,2}:\\d{2}";
const CLAUSE_RE = new RegExp(
  `^(?:(${DAYS_SPEC})\\s+)?(off|closed|${TIME_RANGE}(?:\\s*,\\s*${TIME_RANGE})*)$`,
  "i"
);

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatMinutes(total) {
  const m = total % MINUTES_PER_DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * "Mo-Fr,Su" -> [0,1,2,3,4,6]. Returns null when a token isn't a weekday.
 * Public/school-holiday tokens (PH, SH) are dropped, so "PH off" yields [].
 */
function parseDays(spec) {
  const days = new Set();
  for (const part of spec.split(",")) {
    if (/^(PH|SH)$/i.test(part)) continue;
    const [from, to = from] = part.split("-").map((t) => DAY_TOKENS.indexOf(t[0].toUpperCase() + t.slice(1).toLowerCase()));
    if (from === -1 || to === -1) return null;
    // "Sa-Mo" wraps around the end of the week
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === to) break;
    }
  }
  return [...days];
}

/** "08:00-12:00,14:00-20:00" -> [[480,720],[840,1200]]. A close <= open runs past midnight. */
function parseRanges(spec) {
  return spec.split(",").map((range) => {
    const [, h1, m1, h2, m2] = range.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    const start = Number(h1) * 60 + Number(m1);
    let end = Number(h2) * 60 + Number(m2);
    if (end <= start) end += MINUTES_PER_DAY;
    return [start, end];
  });
}

/**
 * Parse an OSM `opening_hours` tag into a weekly schedule (index 0 = Monday,
 * each entry a list of [startMin, endMin] ranges). OSM's syntax is a full
 * mini-language; we handle weekday ranges, multiple time ranges, "off",
 * "24/7" and overnight hours, ignore public-holiday rules, and mark the whole
 * thing unknown rather than guess wrong on anything else (months, weeks,
 * sunrise/sunset, ...).
 */
function parseOpeningHours(raw) {
  const unknown = { is24h: false, open: null, close: null, unknown: true, raw: raw || null, schedule: null };
  if (!raw || !raw.trim()) return unknown;

  const value = raw.trim();
  const allDay = () => Array.from({ length: 7 }, () => [[0, MINUTES_PER_DAY]]);
  if (/^24\/7$/i.test(value)) {
    return { is24h: true, open: null, close: null, unknown: false, raw: value, schedule: allDay() };
  }

  const schedule = Array.from({ length: 7 }, () => []);
  let sawRule = false;

  // rules are separated by ";" (or ", " between full rules)
  const clauses = value.split(";").flatMap((c) => c.split(/,\s+(?=[A-Za-z])/));
  for (const clause of clauses.map((c) => c.trim()).filter(Boolean)) {
    const match = clause.match(CLAUSE_RE);
    if (!match) return unknown;

    const [, daySpec, timeSpec] = match;
    const days = daySpec ? parseDays(daySpec) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return unknown;
    if (days.length === 0) continue; // holiday-only rule: doesn't affect a normal day

    const ranges = /^(off|closed)$/i.test(timeSpec) ? [] : parseRanges(timeSpec);
    for (const d of days) schedule[d] = ranges; // later rules override earlier ones
    sawRule = true;
  }

  if (!sawRule) return unknown;

  const is24h = schedule.every((r) => r.length === 1 && r[0][0] === 0 && r[0][1] === MINUTES_PER_DAY);
  const firstDay = schedule.find((r) => r.length > 0);
  return {
    is24h,
    open: firstDay ? formatMinutes(firstDay[0][0]) : null,
    close: firstDay ? formatMinutes(firstDay[firstDay.length - 1][1]) : null,
    unknown: false,
    raw: value,
    schedule,
  };
}

/** Weekly schedule for either a parsed OSM hours object or a simple {open, close}/{is24h} one. */
function scheduleOf(hours) {
  if (!hours || hours.unknown) return null;
  if (hours.schedule) return hours.schedule;
  if (hours.is24h) return Array.from({ length: 7 }, () => [[0, MINUTES_PER_DAY]]);
  if (hours.open && hours.close) {
    const [oh, om] = hours.open.split(":").map(Number);
    const [ch, cm] = hours.close.split(":").map(Number);
    const start = oh * 60 + om;
    let end = ch * 60 + cm;
    if (end <= start) end += MINUTES_PER_DAY;
    return Array.from({ length: 7 }, () => [[start, end]]);
  }
  return null;
}

/**
 * Resolve a gym's hours against "now" (server-local time). Returns whether
 * it's open, plus the hours to display: when open, the close time of the
 * current session; when closed, the next opening later today (or null).
 */
function resolveToday(hours, now = new Date()) {
  const { schedule: _omit, ...publicHours } = hours || {};
  const schedule = scheduleOf(hours);
  if (!schedule) {
    return { openNow: null, hours: { is24h: false, open: null, close: null, unknown: true, raw: publicHours.raw ?? null } };
  }

  const day = (now.getDay() + 6) % 7; // JS: 0 = Sunday, ours: 0 = Monday
  const minutes = now.getHours() * 60 + now.getMinutes();
  const base = { is24h: Boolean(hours.is24h), unknown: false, raw: publicHours.raw ?? null };

  if (base.is24h) return { openNow: true, hours: { ...base, open: null, close: null } };

  // a session that started yesterday and runs past midnight
  for (const [start, end] of schedule[(day + 6) % 7]) {
    if (end > MINUTES_PER_DAY && minutes < end - MINUTES_PER_DAY) {
      return { openNow: true, hours: { ...base, open: formatMinutes(start), close: formatMinutes(end) } };
    }
  }

  const today = schedule[day];
  for (const [start, end] of today) {
    if (minutes >= start && minutes < end) {
      return { openNow: true, hours: { ...base, open: formatMinutes(start), close: formatMinutes(end) } };
    }
  }

  const next = today.find(([start]) => start > minutes);
  return { openNow: false, hours: { ...base, open: next ? formatMinutes(next[0]) : null, close: null } };
}

function isOpenNow(hours, now = new Date()) {
  return resolveToday(hours, now).openNow;
}

module.exports = { parseOpeningHours, resolveToday, isOpenNow };
