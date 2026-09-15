export type Mark = '' | 'X' | 'O';
export const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function outcome(board:readonly Mark[]):Mark|'draw' {
  for(const [a,b,c] of lines)if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a];
  return board.every(Boolean)?'draw':'';
}
/** A beatable kitchen opponent: win, block, then prefer the centre/corners. */
export function reply(board:readonly Mark[]):number {
  if(outcome(board))return -1;
  for(const mark of ['O','X'] as const)for(let i=0;i<9;i++)if(!board[i]){
    const next=[...board];next[i]=mark;if(outcome(next)===mark)return i;
  }
  return [4,0,8,2,6,1,3,5,7].find(i=>!board[i])??-1;
}
export class TicTacToe {
  board:Mark[]=Array<Mark>(9).fill('');
  thinking=false;
  play(index:number) {
    if(!Number.isInteger(index)||index<0||index>8||this.thinking||outcome(this.board)||this.board[index])return false;
    this.board[index]='X';this.thinking=!outcome(this.board);return true;
  }
  respond(){if(!this.thinking)return;const i=reply(this.board);if(i>=0)this.board[i]='O';this.thinking=false;}
  reset(){this.board.fill('');this.thinking=false;}
}
