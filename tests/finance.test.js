const test = require('node:test');
const assert = require('node:assert/strict');
const { getPhilippineDateKey, getWeekWindow, getAccountBalance, getSalaryRecommendation } = require('../src/utils/finance');

test('Philippine date logic uses Asia/Manila calendar date', () => {
  const date = new Date('2026-10-06T23:30:00Z');
  const key = getPhilippineDateKey(date);
  assert.equal(key, '2026-10-07');
});

test('Weekly range covers Monday through Sunday', () => {
  const { start, end } = getWeekWindow(new Date('2026-10-06T12:00:00Z'));
  assert.equal(start, '2026-10-05');
  assert.equal(end, '2026-10-11');
});

test('Account balance sums initial balance and recorded transactions only', () => {
  const transactions = [
    { type: 'income', amount: 50000 },
    { type: 'expense', amount: 15000 },
    { type: 'expense', amount: 2500 }
  ];
  const balance = getAccountBalance(100000, transactions);
  assert.equal(balance, 132500);
});

test('Salary recommendation excludes expected salary and missing inputs are unavailable', () => {
  const recommendation = getSalaryRecommendation({
    availableBalance: 0,
    reserves: 0,
    nextExpectedPayday: null,
    accounts: []
  });

  assert.equal(recommendation.status, 'unavailable');
});
