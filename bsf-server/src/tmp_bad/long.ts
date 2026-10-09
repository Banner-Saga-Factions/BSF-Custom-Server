// This is a deliberately over-long comment line that goes well past the one hundred and twenty column limit set for the project, on purpose
export function longOne(a:number):number{
let total = 0;
total += a * 1;
total += a * 2;
total += a * 3;
total += a * 4;
total += a * 5;
total += a * 6;
total += a * 7;
total += a * 8;
total += a * 9;
total += a * 10;
total += a * 11;
total += a * 12;
total += a * 13;
total += a * 14;
total += a * 15;
total += a * 16;
total += a * 17;
total += a * 18;
total += a * 19;
total += a * 20;
total += a * 21;
total += a * 22;
total += a * 23;
total += a * 24;
total += a * 25;
total += a * 26;
total += a * 27;
total += a * 28;
total += a * 29;
total += a * 30;
total += a * 31;
total += a * 32;
total += a * 33;
total += a * 34;
total += a * 35;
total += a * 36;
total += a * 37;
total += a * 38;
total += a * 39;
total += a * 40;
total += a * 41;
total += a * 42;
total += a * 43;
total += a * 44;
total += a * 45;
total += a * 46;
total += a * 47;
total += a * 48;
total += a * 49;
total += a * 50;
total += a * 51;
total += a * 52;
total += a * 53;
total += a * 54;
total += a * 55;
total += a * 56;
total += a * 57;
total += a * 58;
total += a * 59;
total += a * 60;
total += a * 61;
total += a * 62;
total += a * 63;
total += a * 64;
total += a * 65;
total += a * 66;
total += a * 67;
total += a * 68;
total += a * 69;
total += a * 70;
total += a * 71;
total += a * 72;
total += a * 73;
total += a * 74;
total += a * 75;
total += a * 76;
total += a * 77;
total += a * 78;
total += a * 79;
total += a * 80;
total += a * 81;
total += a * 82;
total += a * 83;
total += a * 84;
total += a * 85;
total += a * 86;
total += a * 87;
total += a * 88;
total += a * 89;
total += a * 90;
return total}

export function tangled(n:number):string{
if (n === 1) { return 'v1' }
if (n === 2) { return 'v2' }
if (n === 3) { return 'v3' }
if (n === 4) { return 'v4' }
if (n === 5) { return 'v5' }
if (n === 6) { return 'v6' }
if (n === 7) { return 'v7' }
if (n === 8) { return 'v8' }
if (n === 9) { return 'v9' }
if (n === 10) { return 'v10' }
if (n === 11) { return 'v11' }
if (n === 12) { return 'v12' }
if (n === 13) { return 'v13' }
if (n === 14) { return 'v14' }
if (n === 15) { return 'v15' }
if (n === 16) { return 'v16' }
if (n === 17) { return 'v17' }
return 'none'}

let neverChanged = 5;
export const readIt = () => neverChanged;

export function copyA(items:number[]):number{
  let sum = 0
  for (const item of items) {
    if (item > 10) { sum += item * 2 }
    else if (item > 5) { sum += item + 3 }
    else { sum -= item }
    if (sum > 1000) { sum = 1000 }
  }
  const average = items.length ? sum / items.length : 0
  return Math.round(average * 100) / 100
}

export function copyB(items:number[]):number{
  let sum = 0
  for (const item of items) {
    if (item > 10) { sum += item * 2 }
    else if (item > 5) { sum += item + 3 }
    else { sum -= item }
    if (sum > 1000) { sum = 1000 }
  }
  const average = items.length ? sum / items.length : 0
  return Math.round(average * 100) / 100
}
