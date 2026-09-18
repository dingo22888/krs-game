import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanAuthCallbackUrl, passwordSetupRequested} from '../src/services/auth-url.ts';

test('recognizes recovery and invitations before SDK URL processing, in query and hash',()=>{
  for(const suffix of ['?type=recovery&access_token=fixture', '#type=recovery&access_token=fixture',
    '?type=invite', '#type=invite', '?set-password=1']) {
    assert.equal(passwordSetupRequested(new URL('https://example.invalid/'+suffix)),true);
  }
  assert.equal(passwordSetupRequested(new URL('https://example.invalid/?type=signup')),false);
  assert.equal(passwordSetupRequested(new URL('https://example.invalid/#other=recovery')),false);
});

test('removes query credentials while preserving recovery intent across reloads',()=>{
  const clean=cleanAuthCallbackUrl(new URL('https://example.invalid/?access_token=fixture&refresh_token=secret&type=recovery&expires_in=3600&lang=de'),true);
  assert.equal(clean,'/?lang=de&set-password=1');
  assert.equal(passwordSetupRequested(new URL(clean,'https://example.invalid')),true);
});

test('removes hash credentials and clears completed setup, preserves unrelated anchors',()=>{
  assert.equal(cleanAuthCallbackUrl(new URL('https://example.invalid/?set-password=1#access_token=fixture&type=invite'),false),'/');
  assert.equal(cleanAuthCallbackUrl(new URL('https://example.invalid/?lang=de#help'),false),'/?lang=de#help');
});
