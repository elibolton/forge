import { describe, expect, test } from 'vitest';
import { detectDevice } from './install.svelte';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

describe('detectDevice', () => {
  test.each([
    ['iphoneSafari', 5, 'ios', 'safari'],
    ['iphoneChrome', 5, 'ios', 'chrome'],
    ['iphoneFirefox', 5, 'ios', 'firefox'],
    ['ipadDesktop', 5, 'ios', 'safari'],
    ['androidChrome', 5, 'android', 'chrome'],
    ['androidSamsung', 5, 'android', 'samsung'],
    ['androidFirefox', 5, 'android', 'firefox'],
    ['macChrome', 0, 'other', 'other'],
    ['ipadDesktop', 0, 'other', 'other'],
  ] as const)('%s with %i touch points → %s %s', (ua, touch, os, browser) => {
    expect(detectDevice(UA[ua], touch)).toEqual({ os, browser });
  });
});
