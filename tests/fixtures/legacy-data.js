function createLegacyData() {
  const timestamps = { createdAt: new Date('2000-01-01T00:00:00Z'), updatedAt: new Date('2000-01-02T00:00:00Z') };
  const record = (_id, fields) => ({ _id, ...fields, ...timestamps });
  return {
    accounts: [record('legacy-account', { name: 'Legacy wallet', type: 'Cash', initialBalance: 10000, archived: false })],
    transactions: [
      record('legacy-expense', { accountId: 'legacy-account', type: 'expense', amount: 1250, description: 'Legacy expense', occurredAt: new Date('2000-01-01T04:00:00Z') }),
      record('legacy-income', { accountId: 'legacy-account', type: 'income', amount: 2500, category: 'Salary', description: 'Legacy salary', occurredAt: new Date('2000-01-01T05:00:00Z') })
    ],
    budgets: [record('legacy-budget', { month: '2000-01', amount: 31000 })],
    reserves: [record('legacy-reserve', { amount: 500, label: 'Legacy reserve', userId: null })],
    daily_overrides: [record('legacy-override', { date: '2000-01-01', targetAmount: 1000, reason: 'Legacy override' })],
    career_probation: [record('legacy-probation', { startDate: '2000-01-01', endDate: '2000-06-01', elapsedDays: 0, remainingDays: 0 })],
    career_checkpoints: [record('legacy-checkpoint', { date: '2000-01-01', title: 'Legacy checkpoint', status: 'upcoming' })],
    career_skills: [record('legacy-skill', { name: 'Legacy skill', status: 'learning' })],
    career_tasks: [record('legacy-task', { title: 'Legacy task', status: 'todo' })],
    career_journal: [record('legacy-journal', { date: '2000-01-01', entry: 'Legacy journal' })]
  };
}

module.exports = { createLegacyData };
