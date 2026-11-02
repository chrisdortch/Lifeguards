import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const modules = ["schedule", "schedule-v2", "schedule-v3", "schedule-v4"];
const repository = fileURLToPath(new URL("../", import.meta.url));

function observe(module, timezone, hour, month = 7, day = 1) {
  const script = `
    const NativeDate = Date;
    const fixed = new NativeDate(2026, ${month}, ${day}, ${hour}, 30);
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed.getTime()])); }
      static now() { return fixed.getTime(); }
    };
    const calendar = await import("./lib/${module}.ts");
    let invalidDateRejected = false;
    try { calendar.isoDate(new Date(NaN)); }
    catch (error) { invalidDateRejected = error instanceof RangeError; }
    console.log(JSON.stringify({
      date: calendar.isoDate(fixed), today: calendar.todayIso(),
      invalidDateRejected,
      tomorrow: calendar.addDays?.("2026-03-07", 1),
      afterSpringChange: calendar.addDays?.("2026-03-08", 1),
      afterFallChange: calendar.addDays?.("2026-11-01", 1)
    }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: repository,
    env: { TZ: timezone, NODE_NO_WARNINGS: "1" },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const module of modules) {
  test(`${module} keeps Chicago evening on its local calendar day`, () => {
    const observed = observe(module, "America/Chicago", 20);
    assert.equal(observed.date, "2026-08-01");
    assert.equal(observed.today, "2026-08-01");
  });

  test(`${module} keeps an eastern-zone morning on its local calendar day`, () => {
    const observed = observe(module, "Pacific/Kiritimati", 0);
    assert.equal(observed.date, "2026-08-01");
    assert.equal(observed.today, "2026-08-01");
  });

  test(`${module} retains midnight and month boundaries in UTC`, () => {
    const observed = observe(module, "UTC", 0, 8, 1);
    assert.equal(observed.date, "2026-09-01");
    assert.equal(observed.today, "2026-09-01");
    assert.equal(observed.invalidDateRejected, true);
  });
}

for (const module of ["schedule-v3", "schedule-v4"]) {
  test(`${module} advances calendar dates through both daylight-saving changes`, () => {
    const observed = observe(module, "America/Chicago", 12);
    assert.equal(observed.tomorrow, "2026-03-08");
    assert.equal(observed.afterSpringChange, "2026-03-09");
    assert.equal(observed.afterFallChange, "2026-11-02");
  });
}
