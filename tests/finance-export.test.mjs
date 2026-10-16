import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/finance-export.ts', import.meta.url), 'utf8');
const { fuelExpense, deliverExpense, FinanceConflict, FINANCE_ORIGIN } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString('base64'));
const fill = { id: 'a', fillDate: '2026-10-16', amount: 50.01, note: 'Планова' };
const snapshot = (transactions = [], revision = 31) => ({ revision, state: { transactions,
  accounts: [{ id: 'cash', currency: 'EUR', budget: true }, { id: 'bourso', currency: 'EUR', budget: true }, { id: 'ukrsib', currency: 'UAH', budget: false }], categories: [{ id: 'cat-8500854d1b' }] } });
test('EUR fuel expense uses cents, date, category and deterministic ID', () => {
  for (const account of ['cash','bourso']) {
    const expense = fuelExpense(fill, account);
    assert.equal(expense.amountNative, 5001); assert.equal(expense.amountEUR, 5001);
    assert.equal(expense.date, fill.fillDate); assert.equal(expense.budgetMonth, '2026-10');
    assert.equal(expense.id, 'fuel-log:a'); assert.equal(expense.account, account);
    assert.equal(expense.category, 'cat-8500854d1b'); assert.equal(expense.sign, -1);
  }
});
test('UKRSIB exports actual UAH debit and retains known EUR cost without guessed FX', () => {
  const expense = fuelExpense(fill, 'ukrsib', 2525.25);
  assert.equal(expense.currency, 'UAH'); assert.equal(expense.amountNative, 252525);
  assert.equal(expense.amountEUR, 5001); assert.equal(expense.budgetIncluded, false);
  for (const amount of [undefined, null, '', -1, 0, Infinity, NaN, 1000001]) assert.throws(() => fuelExpense(fill, 'ukrsib', amount));
  assert.throws(() => fuelExpense(fill, 'pea'));
});
test('delivery sends credentials only to fixed owner-private Finance HUB and validates confirmation', async () => {
  const expense = fuelExpense(fill,'cash'), calls=[];
  await deliverExpense(expense, 'test-secret', async (url, options) => {
    calls.push({url,options}); assert.equal(url, FINANCE_ORIGIN+'/api/finance');
    assert.equal(options.redirect,'error'); assert.equal(options.headers['OAI-Sites-Authorization'],'Bearer test-secret');
    return Response.json(snapshot(options.method==='POST' ? [{...expense,revision:1}] : []));
  });
  assert.equal(calls.length,2);
  const body=JSON.parse(calls[1].options.body); assert.equal(body.revision,31);
  assert.deepEqual(body.operation.data.transaction,expense);
});
test('retry after a lost response reconciles existing record without a second POST', async () => {
  const expense=fuelExpense(fill,'cash'); let writes=0, saved=[];
  const transport=async (_url,options) => {
    if (options.method==='POST') { writes++; saved=[{...expense,revision:1}]; throw new TypeError('lost response'); }
    return Response.json(snapshot(saved));
  };
  await assert.rejects(deliverExpense(expense,'test',transport));
  await deliverExpense(expense,'test',transport); assert.equal(writes,1);
});
test('conflicting or deleted remote expense is preserved without any overwrite', async () => {
  const expense=fuelExpense(fill,'cash');
  for (const changed of [{...expense,amountNative:6000},{...expense,voided:true},{...expense,note:'Changed in Finance HUB'}]) {
    let writes=0;
    await assert.rejects(deliverExpense(expense,'test',async(_url,options)=>{if(options.method==='POST')writes++;return Response.json(snapshot([changed]));}),FinanceConflict);
    assert.equal(writes,0);
  }
});
test('CAS conflict rereads latest revision; bounded conflicts never loop forever', async () => {
  const expense=fuelExpense(fill,'bourso'); let writes=0,reads=0;
  await deliverExpense(expense,'test',async(_url,options)=>{
    if(options.method==='POST'){ writes++; assert.equal(JSON.parse(options.body).revision,reads); return writes===1 ? new Response(null,{status:409}) : Response.json(snapshot([expense])); }
    return Response.json(snapshot([],++reads));
  });
  assert.equal(writes,2);
  writes=0; await assert.rejects(deliverExpense(expense,'test',async(_url,options)=>{if(options.method==='POST'){writes++;return new Response(null,{status:409});}return Response.json(snapshot());}));
  assert.equal(writes,3);
});
test('auth denial, redirects and missing confirmation never report success', async () => {
  const expense=fuelExpense(fill,'cash');
  await assert.rejects(deliverExpense(expense,'test',async()=>new Response(null,{status:401})));
  await assert.rejects(deliverExpense(expense,'test',async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}})));
  await assert.rejects(deliverExpense(expense,'test',async()=>Response.json(snapshot())));
});
test('changed account currency or archived category blocks export before writing', async () => {
  const expense=fuelExpense(fill,'cash');let writes=0;
  const data=snapshot();data.state.categories[0].archived=true;
  await assert.rejects(deliverExpense(expense,'test',async(_url,options)=>{if(options.method==='POST')writes++;return Response.json(data);}),FinanceConflict);
  assert.equal(writes,0);
});
