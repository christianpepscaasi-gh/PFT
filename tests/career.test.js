const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestApp } = require('./app-helper');

test('career probation config calculates elapsed and remaining days without affecting finances', async () => {
  const app = createTestApp();

  const response = await request(app)
    .post('/api/career/probation')
    .send({
      startDate: '2026-08-01',
      endDate: '2026-12-31'
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.elapsedDays > 0, true);
  assert.equal(response.body.remainingDays > 0, true);

  const overview = await request(app).get('/api/reports/overview');
  assert.equal(overview.body.income, 0);
  assert.equal(overview.body.expenses, 0);
});

test('career checkpoint and skill records store user-entered values', async () => {
  const app = createTestApp();

  const checkpointResponse = await request(app)
    .post('/api/career/checkpoints')
    .send({
      date: '2026-10-07',
      title: 'Mid-review',
      notes: 'Discussed goals',
      status: 'upcoming'
    });

  assert.equal(checkpointResponse.status, 201);
  assert.equal(checkpointResponse.body.title, 'Mid-review');

  const skillResponse = await request(app)
    .post('/api/career/skills')
    .send({
      name: 'Node.js',
      status: 'learning'
    });

  assert.equal(skillResponse.status, 201);
  assert.equal(skillResponse.body.status, 'learning');

  const tasksResponse = await request(app)
    .post('/api/career/tasks')
    .send({
      title: 'Finish notes',
      status: 'in-progress',
      dueDate: '2026-10-10'
    });

  assert.equal(tasksResponse.status, 201);
  assert.equal(tasksResponse.body.status, 'in-progress');

  const journalResponse = await request(app)
    .post('/api/career/journal')
    .send({
      date: '2026-10-07',
      entry: 'Reviewed the current roadmap.'
    });

  assert.equal(journalResponse.status, 201);
  assert.equal(journalResponse.body.entry.includes('roadmap'), true);
});
