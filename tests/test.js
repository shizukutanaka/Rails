'use strict';
/* Rails コアロジックのテスト。index.html 内のコア部を取り出して実行する。
 * 実行: node tests/test.js */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('/* ==RAILS-CORE-BEGIN== */');
const end = html.indexOf('/* ==RAILS-CORE-END== */');
if (begin < 0 || end < 0) { console.error('core markers not found in index.html'); process.exit(1); }
const coreCode = html.slice(begin, end);
const RailsCore = new Function(coreCode + '\nreturn RailsCore;')();
const C = RailsCore;
const STOP = C.STOP;

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  ok(a === b, label + (a === b ? '' : '\n  expected: ' + b + '\n  got:      ' + a));
}

// ---- 時刻 ----
eq(C.parseTime('9:05'), 545, 'parseTime 9:05');
eq(C.parseTime('905'), 545, 'parseTime 905');
eq(C.parseTime('0905'), 545, 'parseTime 0905');
eq(C.parseTime('25:30'), 1530, 'parseTime 25:30');
eq(C.parseTime('1:30'), 1530, 'parseTime 1:30 は 25:30 に読み替え');
eq(C.parseTime('0:00'), 1440, 'parseTime 0:00 は 24:00');
eq(C.parseTime('3:00'), 180, 'parseTime 3:00');
eq(C.parseTime('27:59'), 1679, 'parseTime 27:59');
eq(C.parseTime('28:00'), null, 'parseTime 28:00 は不正');
eq(C.parseTime('9:60'), null, 'parseTime 9:60 は不正');
eq(C.parseTime('abc'), null, 'parseTime abc は不正');
eq(C.parseTime(''), null, 'parseTime 空は null');
eq(C.formatTime(545), '9:05', 'formatTime 545');
eq(C.formatTime(1530), '25:30', 'formatTime 1530');
eq(C.formatTime(null), '', 'formatTime null');
eq(C.parseOudTime('533'), 333, 'parseOudTime 533');
eq(C.parseOudTime('2505'), 1505, 'parseOudTime 2505');
eq(C.formatOudTime(1505), '2505', 'formatOudTime 1505');
eq(C.formatOudTime(333), '533', 'formatOudTime 333');

// ---- 色 ----
eq(C.colorToOud('#e60012'), '001200E6', 'colorToOud は 00BBGGRR');
eq(C.colorFromOud('001200E6'), '#e60012', 'colorFromOud');
eq(C.colorFromOud('00FF0000'), '#0000ff', 'colorFromOud 青');

// ---- サンプルデータ ----
const sample = C.sampleData();
eq(sample.stations.length, 6, 'サンプルは6駅');
eq(sample.diagrams.length, 2, 'サンプルは2ダイヤ');
deepEq(C.validate(sample), [], 'サンプルは検証エラー・警告ゼロ');
eq(C.destination(sample, sample.diagrams[0].trains[0]), '浜辺', '下り列車の行先は浜辺');
eq(C.destination(sample, sample.diagrams[0].trains[5]), '青葉', '上り列車の行先は青葉');

// ---- 駅時刻表 ----
const deps = C.stationDepartures(sample, 0, 0, 'down');
deepEq(deps.map(d => d.time), [360, 370, 380, 390, 1438], '青葉・下りの発車時刻一覧 (時刻順)');
ok(deps.every(d => d.dest === '浜辺'), '青葉・下りの行先は全て浜辺');
const depsUp = C.stationDepartures(sample, 0, 5, 'up');
deepEq(depsUp.map(d => d.time), [365, 375, 400], '浜辺・上りの発車時刻一覧');

// ---- ダイヤグラム線分 ----
const segs = C.trainSegments(sample.diagrams[0].trains[2], 6); // 下り特急
eq(segs.length, 1, '特急は1線分');
eq(segs[0].length, 7, '特急の点は7つ (高原で着・発2点)');
eq(segs[0][0].x, 390, '特急の始点時刻');

// ---- 駅の挿入/削除/移動 ----
const d2 = C.sampleData();
C.insertStation(d2, 2, '新駅');
eq(d2.stations.length, 7, '挿入で7駅');
eq(d2.diagrams[0].trains[0].stops.length, 7, '挿入で stops も7件');
eq(d2.diagrams[0].trains[0].stops[3].arr, 369, '挿入で川向の時刻が index 3 にずれる');
eq(d2.diagrams[0].trains[0].stops[2].s, STOP.NONE, '挿入された駅は未設定');
C.removeStation(d2, 2);
eq(d2.stations.length, 6, '削除で6駅に戻る');
eq(d2.diagrams[0].trains[0].stops[2].arr, 369, '削除で時刻が index 2 に戻る');
C.moveStation(d2, 0, 1);
eq(d2.stations[0].name, '新町', '移動で駅順が入れ替わる');
eq(d2.diagrams[0].trains[0].stops[0].arr, 364, '移動で stops も入れ替わる');

// ---- 検証の検出 ----
function miniData(stopsList) {
  return {
    lineName: '検証線',
    stations: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    types: [{ name: '普通', abbr: '普', color: '#000000' }],
    diagrams: [{ name: '平日', trains: [Object.assign(C.newTrain(3), { number: '1', stops: stopsList })] }]
  };
}
function S(s, arr, dep) { return { s, arr, dep }; }
let iss = C.validate(miniData([S(1, null, 600), S(1, 610, 605), S(1, 620, null)]));
ok(iss.some(i => i.code === 'arr-after-dep' && i.level === 'error'), '着>発 を検出');
iss = C.validate(miniData([S(1, null, 600), S(1, 590, 595), S(1, 620, null)]));
ok(iss.some(i => i.code === 'time-regression' && i.level === 'error'), '時刻の逆行を検出');
iss = C.validate(miniData([S(1, null, 600), S(1, null, 610), S(1, 620, null)]));
ok(iss.some(i => i.code === 'dep-only'), '途中駅の発のみを検出');
iss = C.validate(miniData([S(1, null, 600), S(1, 610, null), S(1, 620, null)]));
ok(iss.some(i => i.code === 'arr-only'), '途中駅の着のみを検出');
iss = C.validate(miniData([S(1, null, 600), S(1, null, null), S(1, 620, null)]));
ok(iss.some(i => i.code === 'stop-no-time'), '停車・時刻なしを検出');
iss = C.validate(miniData([S(1, null, 600), S(0, 610, 612), S(1, 620, null)]));
ok(iss.some(i => i.code === 'unset-with-time'), '未設定・時刻ありを検出');
iss = C.validate(miniData([S(1, null, 600), S(3, 610, null), S(1, 620, null)]));
ok(iss.some(i => i.code === 'skip-with-time'), '経由なし・時刻ありを検出');
iss = C.validate(miniData([S(1, null, 600), S(2, null, 610), S(1, 620, null)]));
deepEq(iss, [], '正常な通過列車は問題なし');

// ---- JSON 往復 ----
deepEq(C.importJSON(C.exportJSON(sample)), sample, 'JSON 往復で一致');

// ---- OuDia 往復 ----
function normalize(data) {
  return {
    lineName: data.lineName,
    stations: data.stations.map(s => s.name),
    types: data.types.map(t => [t.name, t.abbr, t.color]),
    diagrams: data.diagrams.map(d => ({
      name: d.name,
      trains: d.trains.map(tr => [tr.number, tr.name, tr.typeIndex, tr.direction, tr.note,
        tr.stops.map(s => [s.s, s.arr, s.dep])])
        .sort((a, b) => (a[3] + a[0]).localeCompare(b[3] + b[0]))
    }))
  };
}
const oudText = C.toOudia(sample);
ok(oudText.startsWith('FileType=OuDia.1.02'), 'OuDia 先頭は FileType');
ok(oudText.includes('EkiJikoku=1;600,'), '始発は発時刻のみ単記 (1;600)');
ok(oudText.includes('1;2426/'), '終着は着時刻+スラッシュ (24:26 -> 1;2426/)');
deepEq(normalize(C.fromOudia(oudText)), normalize(sample), 'OuDia 往復で一致');

// ---- 実在形式に近い .oud 断片のパース ----
const snippet = [
  'FileType=OuDia.1.02',
  'Rosen.',
  'Rosenmei=テスト線',
  'Eki.', 'Ekimei=甲', 'Ekijikokukeisiki=Jikokukeisiki_Hatsu', 'Ekikibo=Ekikibo_Ippan', '.',
  'Eki.', 'Ekimei=乙', 'Ekijikokukeisiki=Jikokukeisiki_Hatsuchaku', 'Ekikibo=Ekikibo_Ippan', '.',
  'Eki.', 'Ekimei=丙', 'Ekijikokukeisiki=Jikokukeisiki_Hatsu', 'Ekikibo=Ekikibo_Ippan', '.',
  'Ressyasyubetsu.', 'Syubetsumei=普通', 'Ryakusyou=普', 'JikokuhyouMojiColor=00FF0000',
  'JikokuhyouFontIndex=0', 'DiagramSenColor=00FF0000', 'DiagramSenStyle=SenStyle_Jissen', '.',
  'Dia.', 'DiaName=平日',
  'Kudari.', 'Ressya.', 'Houkou=Kudari', 'Syubetsu=0', 'Ressyabangou=101M',
  'EkiJikoku=1;533,2;540,1;548/', '.', '.',
  'Nobori.', 'Ressya.', 'Houkou=Nobori', 'Syubetsu=0', 'Ressyabangou=102M',
  'EkiJikoku=1;600,1;610/612,1;620/', '.', '.',
  '.', '.',
  'FileTypeAppComment=OuDia Ver. 1.02.05'
].join('\r\n');
const parsed = C.fromOudia(snippet);
eq(parsed.lineName, 'テスト線', '断片: 路線名');
deepEq(parsed.stations.map(s => s.name), ['甲', '乙', '丙'], '断片: 駅名');
eq(parsed.types[0].color, '#0000ff', '断片: 色は 00BBGGRR から変換');
const down = parsed.diagrams[0].trains.find(t => t.direction === 'down');
eq(down.number, '101M', '断片: 列車番号');
deepEq(down.stops[0], { s: 1, arr: null, dep: 333 }, '断片: 始発は発のみ (1;533)');
deepEq(down.stops[1], { s: 2, arr: null, dep: 340 }, '断片: 通過 (2;540)');
deepEq(down.stops[2], { s: 1, arr: 348, dep: null }, '断片: 終着は着のみ (1;548/)');
const up = parsed.diagrams[0].trains.find(t => t.direction === 'up');
deepEq(up.stops[2], { s: 1, arr: null, dep: 360 }, '断片: 上りは運行順 (丙が始発)');
deepEq(up.stops[1], { s: 1, arr: 370, dep: 372 }, '断片: 上りの中間駅は着/発 (1;610/612)');
deepEq(up.stops[0], { s: 1, arr: 380, dep: null }, '断片: 上りの終着は甲');

// 末尾省略 (経由なし) の扱い
const snippet2 = snippet.replace('EkiJikoku=1;600,1;610/612,1;620/', 'EkiJikoku=1;600');
const parsed2 = C.fromOudia(snippet2);
const up2 = parsed2.diagrams[0].trains.find(t => t.direction === 'up');
eq(up2.stops[1].s, STOP.SKIP, '末尾省略された駅は経由なし');
eq(up2.stops[0].s, STOP.SKIP, '末尾省略された駅は経由なし (2)');

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
