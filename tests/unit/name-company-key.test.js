import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameCompanyKey } from '../../storage/contacts-repository.js';

test('nameCompanyKey normalizes name and company case/accents/whitespace', () => {
  assert.equal(
    nameCompanyKey('  Frédéric  ALLOUCH ', 'NERYTEC Consulting'),
    nameCompanyKey('frederic allouch', 'nerytec consulting')
  );
});

test('nameCompanyKey requires BOTH name and company', () => {
  assert.equal(nameCompanyKey('Jane Doe', ''), null);
  assert.equal(nameCompanyKey('', 'Acme'), null);
  assert.equal(nameCompanyKey('Jane Doe', 'Acme') !== null, true);
});

test('different people or companies produce different keys', () => {
  assert.notEqual(nameCompanyKey('Jane Doe', 'Acme'), nameCompanyKey('John Doe', 'Acme'));
  assert.notEqual(nameCompanyKey('Jane Doe', 'Acme'), nameCompanyKey('Jane Doe', 'Globex'));
});
