// Block check-ins live in the profile, so they ride along in backups and change the plan basis.
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';

const { app, readBackup } = await import('./store.svelte');
const { checkInBasis, planBasis } = await import('./plans');
const { Gyms, defaultPlan } = await import('../engine');

const answer = { jointPain: false, stillSore: true, poorSleepOrMotivation: false, stalled: false, answeredAt: 1_800_000_000_000 };
const backup = (blockCheckIns: unknown) => JSON.stringify({
  app: 'forge', version: 2, profile: { usesPounds: false, createdAt: 1, weeklyGoal: 4, blockCheckIns }, logs: [],
});

describe('Block check-ins in backups', () => {
  test('a backup keeps them', () => {
    const restored = readBackup(backup({ 1700000000000: { 5: answer } }));
    expect(restored.profile.blockCheckIns).toEqual({ '1700000000000': { 5: answer } });
  });

  test('the app writes them into its backup file', () => {
    app.createProfile(defaultPlan(), Gyms.commercial(), false);
    app.saveBlockCheckIn(1700000000000, 6, answer);
    expect(readBackup(app.backup()).profile.blockCheckIns).toEqual({ '1700000000000': { 6: answer } });
  });

  test('damaged ones, or none, read as empty', () => {
    expect(readBackup(backup('oops')).profile.blockCheckIns).toEqual({});
    expect(readBackup(backup(undefined)).profile.blockCheckIns).toEqual({});
    expect(readBackup(backup({ x: { 5: answer }, 1: { 9: answer } })).profile.blockCheckIns).toEqual({});
  });
});

describe('Plan basis', () => {
  test('changes when a check-in is saved, and is unchanged without any', () => {
    const p = readBackup(backup(undefined)).profile;
    expect(checkInBasis(p)).toBe('');
    const before = planBasis(p, []);
    // The same 15 fields as before check-ins existed, so saved plans don't all offer a rebuild.
    expect(before.split('|').length).toBe(15);
    const withOne = planBasis({ ...p, blockCheckIns: { '1': { 5: answer } } }, []);
    expect(withOne).not.toBe(before);
    expect(planBasis({ ...p, blockCheckIns: { '1': { 5: { ...answer, stillSore: false } } } }, [])).not.toBe(withOne);
    expect(planBasis({ ...p, blockCheckIns: { '1': { 5: { ...answer, skipped: true } } } }, [])).not.toBe(withOne);
  });
});
