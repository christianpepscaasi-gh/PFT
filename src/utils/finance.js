const { Intl } = global;

function getManilaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function getPhilippineDateKey(date) {
  const { year, month, day } = getManilaDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Offset-free transaction timestamps are Philippine wall-clock times.
function parsePhilippineDate(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value !== 'string') return new Date(NaN);
  const normalized = value.trim();
  const calendarDate = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(normalized);
  if (!calendarDate) return new Date(NaN);
  const calendarCheck = new Date(`${calendarDate[1]}T00:00:00Z`);
  if (Number.isNaN(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 10) !== calendarDate[1]) {
    return new Date(NaN);
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(dateOnly ? `${normalized}T00:00:00+08:00`
    : hasOffset ? normalized : `${normalized}+08:00`);
}

function getWeekWindow(date) {
  const { year, month, day } = getManilaDateParts(date);
  const seed = new Date(Date.UTC(year, month - 1, day, 12));
  const dayOfWeek = seed.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const start = new Date(Date.UTC(year, month - 1, day + diffToMonday, 12));
  const end = new Date(Date.UTC(year, month - 1, day + diffToMonday + 6, 12));

  return {
    start: getPhilippineDateKey(start),
    end: getPhilippineDateKey(end)
  };
}

function getAccountBalance(initialBalance, transactions = [], asOfDate = null) {
  return transactions.reduce((total, transaction) => {
    if (asOfDate && getPhilippineDateKey(parsePhilippineDate(transaction.occurredAt)) > asOfDate) return total;
    const amount = Number(transaction.amount) || 0;
    if (transaction.type === 'income') {
      return total + amount;
    }
    if (transaction.type === 'expense') {
      return total - amount;
    }
    return total;
  }, Number(initialBalance) || 0);
}

function getSalaryRecommendation({ availableBalance, reserves = 0, nextExpectedPayday, accounts = [] }) {
  if (availableBalance == null || nextExpectedPayday == null || !Array.isArray(accounts) || accounts.length === 0) {
    return {
      status: 'unavailable',
      amount: null,
      reason: 'Missing required planning inputs.'
    };
  }

  const usableBalance = Number(availableBalance) - Number(reserves || 0);
  const days = Math.max(1, Math.ceil((new Date(nextExpectedPayday).getTime() - Date.now()) / 86400000));

  if (usableBalance <= 0 || days <= 0) {
    return {
      status: 'unavailable',
      amount: null,
      reason: 'No valid planning window is available.'
    };
  }

  return {
    status: 'estimate',
    amount: Math.max(0, Math.floor(usableBalance / days)),
    inputs: {
      availableBalance: Number(availableBalance),
      reserves: Number(reserves || 0),
      nextExpectedPayday
    },
    days
  };
}

module.exports = {
  parsePhilippineDate,
  getPhilippineDateKey,
  getWeekWindow,
  getAccountBalance,
  getSalaryRecommendation
};
