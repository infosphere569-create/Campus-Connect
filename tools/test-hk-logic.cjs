// Unit tests for the Hackathons backend logic with an in-memory Firestore. Run: node tools/test-hk-logic.cjs
const assert = require('assert');
const L = require('../server-functions/hk-logic');
const { renderEmail, KINDS } = require('../server-functions/hk-templates');

function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed)); let n = 0;
  const col = c => (data[c] = data[c] || {});
  const q = (c, f = []) => ({
    where: (k, op, v) => q(c, [...f, [k, v]]),
    count: () => ({ get: async () => ({ data: () => ({ count: Object.values(col(c)).filter(r => f.every(([k, v]) => r[k] === v)).length }) }) })
  });
  return {
    _data: data,
    collection: c => ({
      doc: id => ({
        get: async () => ({ exists: !!col(c)[id], id, data: () => ({ ...col(c)[id] }) }),
        set: async v => { col(c)[id] = { ...v }; }, update: async v => { assert(col(c)[id], 'update of missing doc ' + c + '/' + id); Object.assign(col(c)[id], v); }
      }),
      add: async v => { const id = 'a' + (++n); col(c)[id] = { ...v }; return { id }; },
      where: (k, op, v) => q(c, [[k, v]]), count: q(c).count
    })
  };
}
const NOW = 1_800_000_000_000;
const hk = { title: 'CodeSprint', hostUid: 'host', hostName: 'Coding Club', brandName: 'Coding Club', startMs: NOW + 864e5, endMs: NOW + 2 * 864e5, mode: 'offline', city: 'Prayagraj', college: 'MNNIT',
  organiser: { name: 'Riya Sharma', designation: 'Secretary', email: 'riya@club.in', phone: '9999999999' }, rounds: [{ name: 'Idea round' }, { name: 'Final' }] };
const reg = { hackathonId: 'h1', uid: 'p1', hostUid: 'host', name: 'Ayush', email: 'ayush@example.com', teamMode: 'team', teamName: 'Null Pointers', status: 'registered', stage: 0 };
const seed = () => ({ hkHackathons: { h1: hk }, hkRegistrations: { h1_p1: reg }, users: { host: { role: 'student' }, admin: { role: 'platformAdmin', isActive: true }, s1: { isActive: true }, s2: { isActive: true }, s3: { isActive: false } },
  groups: { g1: { status: 'approved' }, g2: { status: 'pending' } }, issues: { i1: { status: 'Resolved' }, i2: { status: 'Open' }, i3: { status: 'Resolved' } },
  hkTests: { h1: { hostUid: 'host', title: 'Screening', durationMin: 30, startMs: NOW - 1000, endMs: NOW + 864e5 } },
  hkTestKeys: { h1: { questions: [{ id: 'q1', text: '2+2?', options: ['3', '4'], marks: 2 }, { id: 'q2', text: 'Sky?', options: ['Blue', 'Red'], marks: 1 }], answers: { q1: 1, q2: 0 } } } });

(async () => {
  const sent = []; const send = async m => sent.push(m);
  let db = fakeDb(seed());
  const rej = async (p, code) => { try { await p; assert.fail('should reject ' + code); } catch (e) { assert.strictEqual(e.code, code, `${e.code}: ${e.message}`); } };

  // templates
  for (const k of Object.keys(KINDS)) { const m = renderEmail(k, { hackathon: hk, hackathonId: 'h1', reg, round: 'Final', note: k === 'custom' ? 'Hello <b>x</b>' : '' }); assert(m.subject && m.html.includes('Riya Sharma') && m.text.includes('Riya Sharma'), k); }
  assert(!renderEmail('custom', { hackathon: hk, reg, note: '<script>alert(1)</script>' }).html.includes('<script>'), 'note must be escaped');
  console.log('templates ok');

  // notify: auth + permissions
  await rej(L.notifyTeamCore({ db, send, auth: null, data: {} }), 'unauthenticated');
  await rej(L.notifyTeamCore({ db, send, auth: { uid: 'stranger' }, data: { registrationId: 'h1_p1', kind: 'shortlisted' } }), 'permission-denied');
  await rej(L.notifyTeamCore({ db, send, auth: { uid: 'host' }, data: { registrationId: 'h1_p1', kind: 'bogus' } }), 'invalid-argument');
  await rej(L.notifyTeamCore({ db, send, auth: { uid: 'host' }, data: { registrationId: 'h1_p1', kind: 'custom', note: '' } }), 'invalid-argument');
  assert.strictEqual(sent.length, 0);
  // notify: success, From is handled by transport; logs + in-app notification written
  const r = await L.notifyTeamCore({ db, send, now: NOW, auth: { uid: 'host' }, data: { registrationId: 'h1_p1', kind: 'shortlisted', note: 'See you at the final!', roundName: 'Final' } });
  assert.strictEqual(r.ok, true); assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].to, 'ayush@example.com'); assert.strictEqual(sent[0].replyTo, 'riya@club.in');
  assert(sent[0].html.includes('See you at the final!') && sent[0].html.includes('Riya Sharma') && sent[0].html.includes('Final'));
  assert.strictEqual(Object.keys(db._data.hkMailLog).length, 1); assert.strictEqual(Object.keys(db._data.hkNotifications).length, 1);
  await rej(L.notifyTeamCore({ db, send, now: NOW + 5000, auth: { uid: 'host' }, data: { registrationId: 'h1_p1', kind: 'waitlisted' } }), 'resource-exhausted');
  await L.notifyTeamCore({ db, send, now: NOW + 60000, auth: { uid: 'admin' }, data: { registrationId: 'h1_p1', kind: 'waitlisted' } }); // staff may send
  assert.strictEqual(sent.length, 2);
  console.log('notify team ok');

  // automatic emails
  sent.length = 0; db = fakeDb(seed());
  assert((await L.onRegistrationCreatedCore({ db, send, now: NOW, id: 'h1_p1', reg })).sent); assert(sent[0].subject.startsWith("You're registered"));
  const after = { ...db._data.hkRegistrations.h1_p1, status: 'shortlisted' }; const before = { ...after, status: 'registered' };
  assert.strictEqual((await L.onRegistrationUpdatedCore({ db, send, now: NOW + 99999, id: 'h1_p1', before, after })).kind, 'shortlisted');
  assert.strictEqual((await L.onRegistrationUpdatedCore({ db, send, id: 'h1_p1', before: { ...after, lastMailAtMs: 1 }, after: { ...after, lastMailAtMs: 2 } })).skipped, 'own-write');
  assert.strictEqual((await L.onRegistrationUpdatedCore({ db, send, id: 'h1_p1', before: after, after: { ...after, hostNote: 'x' } })).skipped, 'no-change');
  db._data.hkHackathons.h1.autoEmail = false;
  assert.strictEqual((await L.onRegistrationCreatedCore({ db, send, id: 'h1_p1', reg })).skipped, 'disabled');
  console.log('auto emails ok');

  // tests
  db = fakeDb(seed());
  await rej(L.startTestCore({ db, now: NOW, auth: { uid: 'nobody' }, data: { hackathonId: 'h1' } }), 'permission-denied');
  const st = await L.startTestCore({ db, now: NOW, auth: { uid: 'p1' }, data: { hackathonId: 'h1' } });
  assert.strictEqual(st.questions.length, 2); assert(!JSON.stringify(st).includes('answers'), 'answer key must never be returned');
  await rej(L.submitTestCore({ db, now: NOW + 31 * 60 * 1000 + 61000, auth: { uid: 'p1' }, data: { hackathonId: 'h1', answers: {} } }), 'deadline-exceeded');
  const sub = await L.submitTestCore({ db, now: NOW + 5 * 60 * 1000, auth: { uid: 'p1' }, data: { hackathonId: 'h1', answers: { q1: 1, q2: 1 } } });
  assert.deepStrictEqual(sub, { score: 2, total: 3 });
  await rej(L.submitTestCore({ db, now: NOW + 6 * 60 * 1000, auth: { uid: 'p1' }, data: { hackathonId: 'h1', answers: { q1: 1, q2: 0 } } }), 'already-exists');
  await rej(L.startTestCore({ db, now: NOW + 6 * 60 * 1000, auth: { uid: 'p1' }, data: { hackathonId: 'h1' } }), 'already-exists');
  console.log('tests ok');

  // stats
  db = fakeDb(seed());
  const s = await L.publicStatsCore({ db, now: NOW });
  assert.deepStrictEqual([s.students, s.clubs, s.resolvedIssues], [3, 1, 2]);
  db._data.users.s9 = { isActive: true }; assert.strictEqual((await L.publicStatsCore({ db, now: NOW + 1000 })).students, 3, 'served from cache');
  assert.strictEqual((await L.publicStatsCore({ db, now: NOW + 11 * 60 * 1000 })).students, 4, 'cache expires');
  console.log('stats ok');
  console.log('ALL BACKEND TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
