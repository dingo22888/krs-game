import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TicTacToe,outcome,reply,lines,type Mark} from '../src/game/tic-tac-toe.ts';
test('all winning lines and a draw are detected',()=>{
  for(const line of lines)for(const mark of ['X','O'] as const){const b:Mark[]=Array<Mark>(9).fill('');for(const i of line)b[i]=mark;assert.equal(outcome(b),mark);}
  assert.equal(outcome(['X','O','X','X','O','O','O','X','X']),'draw');
});
test('opponent wins before blocking and blocks immediate threats',()=>{
  assert.equal(reply(['O','O','','X','X','','','','']),2);
  assert.equal(reply(['X','X','','','O','','','','']),2);
});
test('occupied cells, double taps, invalid indices and terminal games cannot change board',()=>{
  const g=new TicTacToe();assert.equal(g.play(-1),false);assert.equal(g.play(1.5),false);assert.equal(g.play(9),false);
  assert.equal(g.play(0),true);assert.equal(g.play(1),false);g.respond();assert.equal(g.play(0),false);
  g.board=['X','X','X','O','O','','','',''];const before=[...g.board];assert.equal(g.play(5),false);g.respond();assert.deepEqual(g.board,before);
  g.reset();assert.equal(g.thinking,false);assert.deepEqual(g.board,Array(9).fill(''));
});
test('every legal reachable game terminates with legal replies',()=>{
  let games=0;
  function explore(board:Mark[]){
    if(outcome(board)){games++;return;}
    for(let i=0;i<9;i++)if(!board[i]){
      const next=[...board];next[i]='X';
      if(!outcome(next)){const r=reply(next);assert.ok(r>=0&&r<9);assert.equal(next[r],'');next[r]='O';}
      explore(next);
    }
  }
  explore(Array<Mark>(9).fill(''));assert.ok(games>100);
});
