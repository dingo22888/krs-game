import {test} from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/auth.ts';
import model from '../api/house-model.ts';
import scores from '../api/highscores.ts';
import {scoreResult} from '../src/server/score-rules.ts';
import {smallBody, publicConfig} from '../src/server/supabase.ts';

test('Supabase APIs fail closed, validate the user remotely and require active membership', async t=>{
  const names=['GAME_AUTH_MODE','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','GAME_PASSWORD'];
  const old=Object.fromEntries(names.map(k=>[k,process.env[k]])),original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;for(const key of names){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}});
  process.env.GAME_AUTH_MODE='password';process.env.GAME_PASSWORD='fixture-password';
  const login=await auth.fetch(new Request('https://game.test/api/auth',{method:'POST',body:JSON.stringify({password:'fixture-password'})}));
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  process.env.GAME_AUTH_MODE='supabase';process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.SUPABASE_SECRET_KEY='sb_secret_never_public';
  let membership=false,valid=true,anonymous=false,calls=0;
  const runId='22222222-2222-4222-8222-222222222222';
  globalThis.fetch=async(input,init)=>{
    calls++;const url=String(input);
    if(url.includes('/auth/v1/user')){
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-token');
      return Response.json(valid?{id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',is_anonymous:anonymous}:{msg:'invalid'},{status:valid?200:401});
    }
    if(url.includes('/rest/v1/game_members'))return Response.json(membership?{user_id:'11111111-1111-4111-8111-111111111111'}:null);
    if(url.includes('/rest/v1/player_profiles'))return Response.json({display_name:'Testspieler'});
    if(url.includes('/rest/v1/rpc/game_leaderboard'))return Response.json([]);
    if(url.includes('/rest/v1/rpc/start_game_run')){
      const row={id:runId,expires_at:'2099-01-01T00:00:00Z'};
      return Response.json(new Headers(init?.headers).get('Accept')==='application/vnd.pgrst.object+json'?row:[row]);
    }
    if(url.includes('/rest/v1/game_runs'))return Response.json({game:'tic-tac-toe'});
    if(url.includes('/rest/v1/rpc/finish_game_run')){
      const row={score:14,secondary_score:0};
      return Response.json(new Headers(init?.headers).get('Accept')==='application/vnd.pgrst.object+json'?row:[row]);
    }
    throw new Error('Unexpected upstream '+url);
  };
  const request=(path:string,headers:Record<string,string>={})=>new Request('https://game.test/api/'+path,{headers});
  await t.test('public configuration never contains server key',async()=>{
    const response=await auth.fetch(request('auth?config'));assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes('sb_secret'));assert.ok(body.includes('sb_publishable_test'));
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_wrong_slot';assert.throws(()=>publicConfig());process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  });
  await t.test('old password cookie and unauthenticated requests cannot access model or scores',async()=>{
    const before=calls;
    assert.equal((await model.fetch(request('house-model',{cookie}))).status,401);
    assert.equal((await scores.fetch(request('highscores?game=pong'))).status,401);
    assert.equal((await auth.fetch(new Request('https://game.test/api/auth',{method:'POST',body:JSON.stringify({password:'fixture-password'})}))).status,405);
    assert.equal(calls,before);
  });
  await t.test('valid token without membership has no access',async()=>{
    assert.equal((await model.fetch(request('house-model',{authorization:'Bearer test-token'}))).status,403);
  });
  await t.test('member receives profile and leaderboard, invalid or anonymous token is rejected',async()=>{
    membership=true;
    assert.equal((await auth.fetch(request('auth',{authorization:'Bearer test-token'}))).status,200);
    assert.equal((await scores.fetch(request('highscores?game=pong',{authorization:'Bearer test-token'}))).status,200);
    valid=false;assert.equal((await model.fetch(request('house-model',{authorization:'Bearer test-token'}))).status,401);
    valid=true;anonymous=true;assert.equal((await auth.fetch(request('auth',{authorization:'Bearer test-token'}))).status,401);
  });
  await t.test('an invalid auth mode cannot fall back to legacy password',async()=>{
    process.env.GAME_AUTH_MODE='typo';assert.equal((await model.fetch(request('house-model',{cookie}))).status,503);
  });
  await t.test('start and finish return a usable run ID and saved score for composite RPC rows',async()=>{
    process.env.GAME_AUTH_MODE='supabase';valid=true;anonymous=false;membership=true;
    const post=(body:unknown)=>scores.fetch(new Request('https://game.test/api/highscores',{method:'POST',headers:{authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify(body)}));
    const started=await post({action:'start',game:'tic-tac-toe'});
    assert.equal(started.status,200);assert.equal((await started.json()).runId,runId);
    const saved=await post({action:'finish',game:'tic-tac-toe',runId,result:{wins:3,draws:5,losses:2}});
    assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{saved:true,score:14,secondary:0});
  });
});
test('score rules reject unfinished and impossible results',()=>{
  assert.deepEqual(scoreResult('pong',{player:5,opponent:2}),{score:1,secondary:3,details:{player:5,opponent:2}});
  assert.throws(()=>scoreResult('pong',{player:5,opponent:5}));assert.throws(()=>scoreResult('pong',{player:4,opponent:2}));
  assert.throws(()=>scoreResult('boxing',{hits:4,combo:5}));assert.throws(()=>scoreResult('boxing',{hits:601,combo:1}));
  assert.throws(()=>scoreResult('boxing',{hits:2.5,combo:1}));
  assert.equal(scoreResult('tic-tac-toe',{wins:3,draws:5,losses:2}).score,14);
  assert.throws(()=>scoreResult('tic-tac-toe',{wins:3,draws:5,losses:1}));
});
test('API body size is bounded even without content-length',async()=>{
  await assert.rejects(()=>smallBody(new Request('https://test',{method:'POST',body:'x'.repeat(4097)})),/groß/);
  await assert.rejects(()=>smallBody(new Request('https://test',{method:'POST',body:'[]'})),/Ungültige/);
});
