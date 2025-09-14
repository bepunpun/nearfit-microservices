const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOpeningHours, resolveToday, isOpenNow } = require("../src/lib/openingHours");

// 2026-09-14 is a Monday, 2026-09-19 a Saturday, 2026-09-20 a Sunday (local time)
const at = (day, hh, mm = 0) => new Date(2026, 8, day, hh, mm);
const MON = 14;
const SAT = 19;
const SUN = 20;

test("missing or unparseable hours are unknown", () => {
  assert.equal(parseOpeningHours(undefined).unknown, true);
  assert.equal(parseOpeningHours("").unknown, true);
  assert.equal(parseOpeningHours("Jan-Mar 08:00-12:00").unknown, true);
  assert.equal(parseOpeningHours("sunrise-sunset").unknown, true);
  assert.equal(isOpenNow(parseOpeningHours("by appointment"), at(MON, 12)), null);
});

test("24/7 is always open", () => {
  const hours = parseOpeningHours("24/7");
  assert.equal(hours.is24h, true);
  assert.equal(isOpenNow(hours, at(SUN, 3)), true);
});

test("a single daily range", () => {
  const hours = parseOpeningHours("06:00-22:00");
  assert.equal(isOpenNow(hours, at(MON, 5, 59)), false);
  assert.equal(isOpenNow(hours, at(MON, 6)), true);
  assert.equal(isOpenNow(hours, at(MON, 21, 59)), true);
  assert.equal(isOpenNow(hours, at(MON, 22)), false);
});

test("different hours on weekdays and weekends", () => {
  const hours = parseOpeningHours("Mo-Fr 06:00-22:00; Sa-Su 08:00-20:00");
  assert.equal(hours.unknown, false);
  assert.equal(isOpenNow(hours, at(MON, 6, 30)), true);
  assert.equal(isOpenNow(hours, at(SAT, 6, 30)), false);
  assert.equal(isOpenNow(hours, at(SAT, 8, 30)), true);
  assert.equal(isOpenNow(hours, at(SUN, 20, 30)), false);
});

test("days that are not listed are closed, and 'off' closes a day", () => {
  const hours = parseOpeningHours("Mo-Sa 09:00-18:00; Su off");
  assert.equal(isOpenNow(hours, at(SUN, 12)), false);
  assert.equal(isOpenNow(parseOpeningHours("Mo-Fr 09:00-18:00"), at(SAT, 12)), false);
});

test("later rules override earlier ones and holiday rules are ignored", () => {
  const hours = parseOpeningHours("Mo-Su 08:00-22:00; Su 10:00-16:00; PH off");
  assert.equal(hours.unknown, false);
  assert.equal(isOpenNow(hours, at(SUN, 9)), false);
  assert.equal(isOpenNow(hours, at(SUN, 11)), true);
  assert.equal(isOpenNow(hours, at(MON, 9)), true);
});

test("comma-separated rules and multiple ranges in a day", () => {
  const hours = parseOpeningHours("Mo-Fr 08:00-12:00,14:00-20:00, Sa 09:00-13:00");
  assert.equal(isOpenNow(hours, at(MON, 13)), false);
  assert.equal(isOpenNow(hours, at(MON, 15)), true);
  assert.equal(isOpenNow(hours, at(SAT, 10)), true);
  assert.equal(isOpenNow(hours, at(SAT, 15)), false);
});

test("overnight hours spill into the next day", () => {
  const hours = parseOpeningHours("Fr 20:00-02:00");
  assert.equal(isOpenNow(hours, at(SAT, 1)), true);
  assert.equal(isOpenNow(hours, at(SAT, 3)), false);
  assert.equal(isOpenNow(hours, at(MON, 1)), false);
});

test("resolveToday reports close time while open and next opening while closed", () => {
  const hours = parseOpeningHours("Mo-Fr 06:00-12:00,16:00-22:00");

  const open = resolveToday(hours, at(MON, 8));
  assert.equal(open.openNow, true);
  assert.equal(open.hours.close, "12:00");

  const between = resolveToday(hours, at(MON, 13));
  assert.equal(between.openNow, false);
  assert.equal(between.hours.open, "16:00");

  const after = resolveToday(hours, at(MON, 23));
  assert.equal(after.openNow, false);
  assert.equal(after.hours.open, null);
  assert.equal("schedule" in after.hours, false);
});

test("legacy {open, close} and {is24h} shapes still work", () => {
  assert.equal(isOpenNow({ is24h: false, open: "06:00", close: "23:00", unknown: false }, at(MON, 12)), true);
  assert.equal(isOpenNow({ is24h: false, open: "20:00", close: "02:00", unknown: false }, at(MON, 1)), true);
  assert.equal(isOpenNow({ is24h: true, open: null, close: null, unknown: false }, at(MON, 3)), true);
  assert.equal(isOpenNow({ is24h: false, open: null, close: null, unknown: true }, at(MON, 3)), null);
});
