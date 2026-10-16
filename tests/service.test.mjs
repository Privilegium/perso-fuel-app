import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/service-model.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
const { DEFAULT_SERVICES, addMonths, currentMileage, serviceStatus, recordsFor, mergeServices } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const item = id => DEFAULT_SERVICES.find(value => value.id === id);
const record = (serviceId, performedOn, odometer = 100000, action = 'replacement', id = 'r1') => ({ id, serviceId, performedOn, odometer, action, createdAt: '2026-01-01T00:00:00Z', note: null });

test('oil mileage changes green → warning at 10000 → overdue at 12000', () => {
  const records = [record('oil', '2026-01-01')];
  for (const [distance, level] of [[9999,'good'],[10000,'warning'],[11999,'warning'],[12000,'overdue'],[14000,'overdue']]) {
    const status = serviceStatus(item('oil'), records, 100000 + distance, '2026-06-01');
    assert.equal(status.level, level); assert.equal(status.distance, distance);
    assert.equal(status.remainingKm, Math.max(0,12000-distance));
  }
});
test('annual oil limit wins even with little mileage; warning differs from overdue key', () => {
  const records = [record('oil', '2025-10-16')];
  assert.equal(serviceStatus(item('oil'), records, 100100, '2026-10-15').level, 'good');
  const due = serviceStatus(item('oil'), records, 100100, '2026-10-16');
  assert.equal(due.level, 'overdue'); assert.equal(due.reason, 'date');
  assert.notEqual(serviceStatus(item('oil'), records, 110000, '2026-10-15').reminderKey, due.reminderKey);
});
test('new replacement resets the oil cycle; oil filter mirrors it', () => {
  const records = [record('oil','2024-01-01',50000),record('oil','2026-10-01',100000,'replacement','r2')];
  assert.equal(serviceStatus(item('oil'),records,101000,'2026-10-16').distance,1000);
  assert.deepEqual(serviceStatus(item('oil-filter'),records,101000,'2026-10-16').latest, records[1]);
  assert.equal(recordsFor(item('oil-filter'),records).length,2);
});
test('latest fuel date with mileage wins, not greatest mileage or last missing value', () => {
  assert.equal(currentMileage([{id:'a',fillDate:'2026-01-01',odometer:999999},{id:'b',fillDate:'2026-02-01',odometer:100001},{id:'c',fillDate:'2026-03-01',odometer:null}]).id,'b');
  assert.equal(currentMileage([]),null);
});
test('missing or inconsistent mileage remains unknown; calendar status still works', () => {
  const records = [record('oil','2025-01-01')];
  assert.equal(serviceStatus(item('oil'),records,99000,'2025-02-01').distance,null);
  assert.equal(serviceStatus(item('oil'),records,null,'2026-02-01').level,'overdue');
  assert.equal(serviceStatus(item('oil'),[],123000,'2026-02-01').level,'neutral');
});
test('calendar addition clamps leap days and month ends', () => {
  assert.equal(addMonths('2024-02-29',12),'2025-02-28');
  assert.equal(addMonths('2026-08-31',6),'2027-02-28');
});
test('air filters have a 2-year limit; cabin recommends 1 year and limits 2', () => {
  const records = [record('air-filter','2024-10-16'),record('cabin-filter','2024-10-16')];
  assert.equal(serviceStatus(item('air-filter'),records,null,'2026-10-15').level,'good');
  assert.equal(serviceStatus(item('air-filter'),records,null,'2026-10-16').level,'overdue');
  assert.equal(serviceStatus(item('cabin-filter'),records,null,'2025-10-16').level,'warning');
  assert.equal(serviceStatus(item('cabin-filter'),records,null,'2026-10-16').level,'overdue');
});
test('wipers begin with 2 years, switch to annual checks, reset on replacement', () => {
  const install=record('wipers','2024-10-16');
  assert.equal(serviceStatus(item('wipers'),[install],null,'2026-10-16').dueDate,'2026-10-16');
  const check=record('wipers','2026-10-16',null,'inspection','r2');
  assert.equal(serviceStatus(item('wipers'),[install,check],null,'2026-10-16').dueDate,'2027-10-16');
  const replacement=record('wipers','2027-01-01',null,'replacement','r3');
  assert.equal(serviceStatus(item('wipers'),[install,check,replacement],null,'2027-01-01').dueDate,'2029-01-01');
});
test('tires and brakes roll each inspection forward 6 months', () => {
  for(const id of ['tires','brakes']) {
    assert.equal(serviceStatus(item(id),[record(id,'2026-01-01',null,'inspection')],null,'2026-06-30').level,'good');
    assert.equal(serviceStatus(item(id),[record(id,'2026-01-01',null,'inspection')],null,'2026-07-01').level,'overdue');
  }
});
test('fuel filter stays unconfigured; custom services use whichever threshold comes first', () => {
  assert.equal(serviceStatus(item('fuel-filter'),[record('fuel-filter','2020-01-01')],null,'2026-10-16').level,'neutral');
  const custom={id:'custom',kind:'custom',title:'Лампочки',intervalMonths:6,intervalKm:5000,reminders:true};
  assert.equal(serviceStatus(custom,[record('custom','2026-05-01')],106000,'2026-06-01').level,'overdue');
  assert.equal(serviceStatus(custom,[record('custom','2026-05-01')],101000,'2026-11-01').level,'overdue');
  assert.equal(mergeServices([custom]).length,DEFAULT_SERVICES.length+1);
  assert.equal(mergeServices([{...item('oil'),reminders:true}]).filter(v=>v.id==='oil').length,1);
});
