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

// ---- GTFS 読み込み ----
// 自作の最小フィード (実データではない) で往復を検証する
const feedA = {
  'agency.txt': 'agency_id,agency_name\nA1,テスト交通\n',
  'stops.txt': 'stop_id,stop_name\nS1,北浜\nS2,中央\nS3,南町\nS4,港南\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color\nR1,A1,青浜,青浜線,2,E60012\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
    'WD,1,1,1,1,1,0,0,20260101,20261231\nWE,0,0,0,0,0,1,1,20260101,20261231\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name\n' +
    'R1,WD,T1,港南,0,101\nR1,WD,T2,北浜,1,102\nR1,WD,T6,中央,0,106\nR1,WE,T3,港南,0,201\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\n' +
    'T1,,08:00:00,S1,1,0,0\nT1,08:04:00,08:04:00,S2,2,1,1\nT1,08:09:00,08:10:00,S3,3,0,0\nT1,08:16:00,,S4,4,0,0\n' +
    'T2,08:37:00,,S1,4,0,0\nT2,08:31:00,08:32:00,S2,3,0,0\nT2,08:25:00,08:26:00,S3,2,0,0\nT2,,08:20:00,S4,1,0,0\n' +
    'T6,,09:00:00,S1,1,0,0\nT6,09:04:00,09:05:00,S2,2,0,0\n' +
    'T3,,10:00:00,S1,1,0,0\nT3,10:04:00,10:05:00,S2,2,0,0\nT3,10:09:00,10:10:00,S3,3,0,0\nT3,10:16:00,,S4,4,0,0\n'
};
const resA = C.fromGtfs(feedA);
const gA = resA.data;
eq(gA.lineName, '青浜線', 'GTFS: 路線名は route_long_name');
deepEq(gA.stations.map(s => s.name), ['北浜', '中央', '南町', '港南'], 'GTFS: 駅は基準便の停車順');
deepEq(gA.types, [{ name: '青浜線', abbr: '青浜', color: '#e60012' }], 'GTFS: 種別は路線から (色は route_color)');
deepEq(gA.diagrams.map(d => d.name), ['平日', '土休日'], 'GTFS: 曜日パターンがダイヤになる');
const wdTrains = gA.diagrams[0].trains;
deepEq(wdTrains.map(t => t.number), ['101', '106', '102'], 'GTFS: 平日ダイヤは下り→上り・時刻順');
deepEq(wdTrains[0].stops, [
  { s: 1, arr: null, dep: 480 }, { s: 2, arr: null, dep: 484 },
  { s: 1, arr: 489, dep: 490 }, { s: 1, arr: 496, dep: null }
], 'GTFS: 停車/通過 (乗降不可) と時刻の変換');
const gT2 = wdTrains[2];
eq(gT2.direction, 'up', 'GTFS: direction_id 1 は上り');
deepEq(gT2.stops[0], { s: 1, arr: 517, dep: null }, 'GTFS: 上りの終着は駅順の先頭');
deepEq(gT2.stops[3], { s: 1, arr: null, dep: 500 }, 'GTFS: 上りの始発は駅順の末尾');
deepEq(wdTrains[1].stops.map(s => s.s), [1, 1, 3, 3], 'GTFS: 区間便は運行範囲外が経由なし');
deepEq(C.validate(gA), [], 'GTFS: 取り込んだデータは検証を通過');
const gDeps = C.stationDepartures(gA, 0, 0, 'down');
deepEq(gDeps.map(d => d.time), [480, 540], 'GTFS: 駅時刻表に現れる');
deepEq(gDeps.map(d => d.dest), ['港南', '中央'], 'GTFS: 駅時刻表の行先');
deepEq(resA.report.items, [], 'GTFS: 欠落のないフィードは報告ゼロ');
eq(resA.report.trainCount, 4, 'GTFS: 列車数');

// 取り込めない要素は件数と理由つきで報告される
const feedB = {
  'stops.txt': 'stop_id,stop_name\nS1,北浜\nS2,中央\nS3,南町\nS4,港南\nS5,中央\nSX,分岐駅\n',
  'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nR1,青浜,青浜線,2\nR2,山,山線,2\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
    'WD,1,1,1,1,1,0,0,20260101,20261231\nWD2,1,1,1,1,1,0,0,20260101,20261231\n',
  'calendar_dates.txt': 'service_id,date,exception_type\nWD,20260101,2\nWD,20260102,1\n',
  'frequencies.txt': 'trip_id,start_time,end_time,headway_secs\nT8,07:00:00,08:00:00,600\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name\n' +
    'R1,WD,T1,港南,0,101\nR1,WD,T7,港南,0,107\nR1,WD,T8,港南,0,108\nR2,WD,T9,中央,0,901\nR1,WD,T10,港南,0,110\nR1,WD2,T11,港南,0,111\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\n' +
    'T1,,08:00:00,S1,1,0,0\nT1,08:04:00,08:04:00,S2,2,1,1\nT1,08:09:00,08:10:00,S3,3,0,0\nT1,08:16:00,,S4,4,0,0\n' +
    'T7,,12:00:00,S1,1,0,0\nT7,12:05:00,12:05:00,SX,2,0,0\nT7,28:30:00,,S4,3,0,0\n' +
    'T8,,07:00:00,S1,1,0,0\nT8,07:16:00,,S4,2,0,0\n' +
    'T9,,06:00:00,S1,1,0,0\nT9,06:05:00,,S2,2,0,0\n' +
    'T10,,13:00:00,S1,1,0,0\nT10,13:04:30,13:05:00,S5,2,0,0\nT10,13:12:00,,S4,3,0,0\n' +
    'T11,,14:00:00,S1,1,0,0\nT11,14:10:00,,S4,2,0,0\n'
};
const resB = C.fromGtfs(feedB);
const itemsB = {};
resB.report.items.forEach(i => { itemsB[i.code] = i; });
eq(itemsB['routes-skipped'].count, 1, 'GTFS B: 取り込まない路線の件数');
deepEq(itemsB['routes-skipped'].names, ['山線'], 'GTFS B: 取り込まない路線の名前');
eq(itemsB['trips-frequency'].count, 1, 'GTFS B: 発車間隔ベースの便は取り込まない');
eq(itemsB['stops-unplaced'].count, 1, 'GTFS B: 駅並びに置けない停車の件数');
deepEq(itemsB['stops-unplaced'].names, ['分岐駅'], 'GTFS B: 置けない駅の名前');
eq(itemsB['stops-merged'].count, 1, 'GTFS B: 同名駅の統合');
eq(itemsB['times-dropped'].count, 1, 'GTFS B: 範囲外の時刻 (28:30) は取り込まない');
eq(itemsB['times-seconds-rounded'].count, 1, 'GTFS B: 秒は分に丸める');
eq(itemsB['calendar-exceptions'].count, 2, 'GTFS B: 特定日の例外は件数だけ報告');
eq(itemsB['services-merged'].count, 1, 'GTFS B: 同じ曜日パターンの運行区分は統合');
ok(!itemsB['trips-no-times'], 'GTFS B: 停車なし便は報告されない');
deepEq(resB.data.diagrams.map(d => d.name), ['平日'], 'GTFS B: ダイヤは1つに統合される');
eq(resB.report.trainCount, 4, 'GTFS B: 取り込んだ列車数');
const gT10 = resB.data.diagrams[0].trains.find(t => t.number === '110');
deepEq(gT10.stops[1], { s: 1, arr: 785, dep: 785 }, 'GTFS B: 同名駅への統合と秒の丸め (13:04:30 -> 785)');

// calendar が無いフィード
const feedC = Object.assign({}, feedA);
delete feedC['calendar.txt'];
feedC['trips.txt'] = feedA['trips.txt'].replace(/WD|WE/g, 'X');
const resC = C.fromGtfs(feedC);
eq(resC.data.diagrams.length, 1, 'GTFS: calendar なしは1ダイヤ');
eq(resC.data.diagrams[0].name, '曜日不明', 'GTFS: calendar なしは曜日不明');

// direction_id が無いフィードは駅順から推定する
const feedD = {
  'stops.txt': feedA['stops.txt'],
  'routes.txt': feedA['routes.txt'],
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name\n' +
    'R1,X,TD1,港南,,301\nR1,X,TD2,北浜,,302\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    'TD1,,08:00:00,S1,1\nTD1,08:16:00,,S4,2\n' +
    'TD2,,09:00:00,S4,1\nTD2,09:16:00,,S1,2\n'
};
const resD = C.fromGtfs(feedD);
eq(resD.data.diagrams[0].trains.find(t => t.number === '301').direction, 'down', 'GTFS: direction_id なしは駅順から推定 (下り)');
eq(resD.data.diagrams[0].trains.find(t => t.number === '302').direction, 'up', 'GTFS: direction_id なしは駅順から推定 (上り)');

// ---- GTFS ZIP ----
const zlib = require('zlib');
function buildZip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = Buffer.from(e.text, 'utf8');
    const data = e.method === 8 ? zlib.deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(e.method, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}
const zipA = buildZip([
  { name: 'stops.txt', text: feedA['stops.txt'], method: 0 },
  { name: 'routes.txt', text: feedA['routes.txt'], method: 8 },
  { name: 'trips.txt', text: feedA['trips.txt'], method: 8 },
  { name: 'stop_times.txt', text: feedA['stop_times.txt'], method: 8 },
  { name: 'calendar.txt', text: feedA['calendar.txt'], method: 8 },
  { name: 'agency.txt', text: feedA['agency.txt'], method: 8 }
]);
const resZip = C.fromGtfsZip(new Uint8Array(zipA));
deepEq(resZip.data, resA.data, 'GTFS ZIP: 展開して同じデータになる (stored + deflate)');
deepEq(resZip.report, resA.report, 'GTFS ZIP: 報告も同じ');
const zipSub = buildZip(Object.keys(feedA).map(k => ({ name: 'feed/' + k, text: feedA[k], method: 8 })));
deepEq(C.fromGtfsZip(new Uint8Array(zipSub)).data, resA.data, 'GTFS ZIP: サブフォルダ内もファイル名で拾う');
let threw = false;
try { C.fromGtfsZip(new Uint8Array([1, 2, 3, 4])); } catch (e) { threw = true; }
ok(threw, 'GTFS ZIP: ZIP でない入力は例外');
function fakeHugeZip() {
  const name = Buffer.from('stops.txt');
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(10, 20);
  cen.writeUInt32LE(100 * 1024 * 1024, 24); // 展開後 100MB と申告
  cen.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + name.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([cen, name, eocd]);
}
threw = false;
try { C.fromGtfsZip(new Uint8Array(fakeHugeZip())); } catch (e) { threw = true; }
ok(threw, 'GTFS ZIP: 展開後サイズが上限を超える申告は例外 (ZIP 爆弾対策)');
let bigStops = 'stop_id,stop_name\n';
['北浜', '中央', '南町', '港南'].forEach((nm, i) => { bigStops += 'S' + (i + 1) + ',' + nm + '\n'; });
for (let i = 1; i <= 5000; i++) bigStops += 'X' + i + ',ダミー駅' + i + '\n';
const feedBig = Object.assign({}, feedA, { 'stops.txt': bigStops });
const zipBig = buildZip(Object.keys(feedBig).map(k => ({ name: k, text: feedBig[k], method: 8 })));
deepEq(C.fromGtfsZip(new Uint8Array(zipBig)).data, resA.data, 'GTFS ZIP: 大きなファイルでも展開できる');

// ---- GTFS 書き出し ----
eq(C.formatGtfsTime(480), '08:00:00', 'GTFS書出: 480分は 08:00:00');
eq(C.formatGtfsTime(1466), '24:26:00', 'GTFS書出: 深夜は 24:26:00 のまま表記');
eq(C.formatGtfsTime(180), '03:00:00', 'GTFS書出: 始まりは 03:00:00');
eq(C.formatGtfsTime(null), '', 'GTFS書出: 時刻なしは空');

const expSample = C.toGtfs(sample);
deepEq(Object.keys(expSample.files),
  ['agency.txt', 'stops.txt', 'routes.txt', 'calendar.txt', 'trips.txt', 'stop_times.txt'],
  'GTFS書出: ファイル構成');
ok(expSample.files['stops.txt'].includes('S1,青葉'), 'GTFS書出: stops に駅が並ぶ');
ok(expSample.files['calendar.txt'].includes('SVC1,1,1,1,1,1,0,0,'), 'GTFS書出: 平日は月-金のパターン');
ok(expSample.files['calendar.txt'].includes('SVC2,0,0,0,0,0,1,1,'), 'GTFS書出: 土休日は土日のパターン');
eq(expSample.files['trips.txt'].trim().split('\n').length, 12, 'GTFS書出: 便は11件 (+ヘッダ)');
ok(expSample.files['stop_times.txt'].includes('24:26:00'), 'GTFS書出: 深夜の着時刻が 24:26:00 で出る');
eq(expSample.report.trainCount, 11, 'GTFS書出: 列車数');
deepEq(expSample.report.items,
  [{ code: 'types-not-exported', count: 3, names: ['普通', '快速', '特急'] }],
  'GTFS書出: サンプルで書き出せないのは種別だけ');

// GTFS 往復 (種別は GTFS に無い概念なので、再読み込み時に作られる1種別と typeIndex 0 に置き換えて比較する)
function normalizeGtfs(data) {
  const norm = normalize(data);
  norm.diagrams.forEach(d => d.trains.forEach(tr => { tr[2] = 0; }));
  return norm;
}
const backSample = C.fromGtfs(expSample.files).data;
deepEq(backSample.types, [{ name: '青葉線', abbr: '青', color: '#000000' }],
  'GTFS往復: 種別は路線から1つ作られる');
const normSample = normalizeGtfs(sample); normSample.types = backSample.types.map(t => [t.name, t.abbr, t.color]);
deepEq(normalizeGtfs(backSample), normSample, 'GTFS往復: サンプルは種別以外が一致');
deepEq(C.validate(backSample), [], 'GTFS往復: 再読み込みしたデータは検証を通過');

// 読み込んだフィードは無損失で書き出せ、報告もゼロになる
const expA = C.toGtfs(resA.data);
deepEq(expA.report.items, [], 'GTFS書出: feedA は報告ゼロ');
deepEq(C.fromGtfs(expA.files).data, resA.data, 'GTFS往復: feedA は完全に一致 (種別含む)');

// ZIP 往復 (自作 ZIP を自作リーダで読む)
const zipExp = C.toGtfsZip(resA.data);
ok(zipExp.bytes[0] === 0x50 && zipExp.bytes[1] === 0x4b && zipExp.bytes[2] === 0x03 && zipExp.bytes[3] === 0x04,
  'GTFS書出: ZIP のマジック');
deepEq(C.fromGtfsZip(zipExp.bytes).data, resA.data, 'GTFS往復: ZIP 経由でも完全に一致');
deepEq(C.fromGtfsZip(C.toGtfsZip(sample).bytes).data, backSample,
  'GTFS往復: サンプルの ZIP 往復は CSV 往復と同じ結果');

// CSV の引用: カンマを含む駅名がそのまま往復する
const commaData = {
  lineName: '引用線',
  stations: [{ name: '甲,乙' }, { name: '丙' }],
  types: [{ name: '引用線', abbr: '引', color: '#000000' }],
  diagrams: [{ name: '平日', trains: [Object.assign(C.newTrain(2), {
    number: '1', direction: 'down',
    stops: [S(1, null, 600), S(1, 610, null)]
  })] }]
};
ok(C.toGtfs(commaData).files['stops.txt'].includes('"甲,乙"'), 'GTFS書出: カンマを含む駅名は引用される');
eq(C.fromGtfs(C.toGtfs(commaData).files).data.stations[0].name, '甲,乙', 'GTFS往復: カンマを含む駅名');

// 基準便が止まらない駅も、ダミーの通過で駅の並びが保たれる
const anchorData = {
  lineName: '分岐線',
  stations: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
  types: [{ name: '分岐線', abbr: '分', color: '#000000' }],
  diagrams: [{ name: '平日', trains: [
    Object.assign(C.newTrain(3), { number: '1', direction: 'down',
      stops: [S(1, null, 600), S(1, 610, null), S(3, null, null)] }),
    Object.assign(C.newTrain(3), { number: '2', direction: 'down',
      stops: [S(3, null, null), S(1, null, 700), S(1, 710, null)] })
  ] }]
};
const expAnchor = C.toGtfs(anchorData);
const backAnchor = C.fromGtfs(expAnchor.files).data;
deepEq(backAnchor.stations.map(s => s.name), ['A', 'B', 'C'], 'GTFS往復: 基準便が止まらない駅も消えない');
eq(backAnchor.diagrams[0].trains.find(tr => tr.number === '1').stops[2].s, STOP.PASS,
  'GTFS往復: ダミーを補った駅は通過になる');
eq(backAnchor.diagrams[0].trains.find(tr => tr.number === '2').stops[0].s, STOP.SKIP,
  'GTFS往復: 運行範囲外の経由なしはそのまま');
const anchorItems = {};
expAnchor.report.items.forEach(i => { anchorItems[i.code] = i; });
eq(anchorItems['stops-state-changed'].count, 1, 'GTFS書出: ダミーを補った停車は状態変化として報告');

// ダイヤ名の往復 (毎日 / 特定日 / 曜日不明)
function oneTrainDia(name) {
  return { name: name, trains: [Object.assign(C.newTrain(2), {
    number: '1', direction: 'down', stops: [S(1, null, 600), S(1, 610, null)]
  })] };
}
const diaNameData = {
  lineName: '名前線',
  stations: [{ name: 'A' }, { name: 'B' }],
  types: [{ name: '名前線', abbr: '名', color: '#000000' }],
  diagrams: [oneTrainDia('毎日'), oneTrainDia('特定日'), oneTrainDia('曜日不明')]
};
const backDiaNames = C.fromGtfs(C.toGtfs(diaNameData).files).data;
deepEq(backDiaNames.diagrams.map(d => d.name), ['毎日', '特定日', '曜日不明'],
  'GTFS往復: 毎日/特定日/曜日不明のダイヤ名が保たれる');

// 書き出せない要素は件数と理由つきで報告される
function lossyTrain(number, name, stops) {
  return Object.assign(C.newTrain(5), { number: number, name: name || '', typeIndex: 1, direction: 'down', stops: stops });
}
const lossy = {
  lineName: '損失線',
  stations: [{ name: '甲' }, { name: '乙' }, { name: '乙' }, { name: '丙' }, { name: '丁' }],
  types: [
    { name: '普通', abbr: '普', color: '#000000' },
    { name: '快速', abbr: '快', color: '#ff0000' }
  ],
  diagrams: [
    { name: '平日', trains: [
      lossyTrain('1', 'あおぞら', [S(1, null, 600), S(3, null, null), S(2, 610, 611), S(1, 620, null), S(0, null, null)]),
      lossyTrain('99', '', [S(3, null, null), S(3, null, null), S(3, null, null), S(3, null, null), S(3, null, null)])
    ] },
    { name: '月火水木金', trains: [
      lossyTrain('2', '', [S(1, null, 700), S(1, 705, 706), S(1, 710, 711), S(1, 715, null), S(3, null, null)])
    ] },
    { name: '臨時', trains: [
      lossyTrain('3', '', [S(1, null, 800), S(1, 805, 806), S(1, 810, 811), S(1, 815, null), S(3, null, null)])
    ] },
    { name: '空', trains: [] }
  ]
};
const expLossy = C.toGtfs(lossy);
const lossyItems = {};
expLossy.report.items.forEach(i => { lossyItems[i.code] = i; });
eq(lossyItems['types-not-exported'].count, 2, 'GTFS書出(損失): 種別の件数');
deepEq(lossyItems['types-not-exported'].names, ['普通', '快速'], 'GTFS書出(損失): 種別の名前');
eq(lossyItems['train-names-not-exported'].count, 1, 'GTFS書出(損失): 列車名の件数');
deepEq(lossyItems['train-names-not-exported'].names, ['あおぞら'], 'GTFS書出(損失): 列車名');
eq(lossyItems['diagram-names-not-exported'].count, 2, 'GTFS書出(損失): 表せないダイヤ名の件数 (月火水木金は「平日」に戻る)');
deepEq(lossyItems['diagram-names-not-exported'].names, ['月火水木金', '臨時'], 'GTFS書出(損失): 表せないダイヤ名');
eq(lossyItems['diagrams-merged'].count, 1, 'GTFS書出(損失): 同じパターンのダイヤは統合される');
deepEq(lossyItems['diagrams-merged'].names, ['月火水木金'], 'GTFS書出(損失): 統合されるダイヤ名');
eq(lossyItems['diagrams-no-trains'].count, 1, 'GTFS書出(損失): 列車のないダイヤ');
eq(lossyItems['stations-duplicate-names'].count, 1, 'GTFS書出(損失): 同名の駅');
deepEq(lossyItems['stations-duplicate-names'].names, ['乙'], 'GTFS書出(損失): 同名の駅名');
eq(lossyItems['stations-unserved'].count, 1, 'GTFS書出(損失): どの列車も使わない駅');
deepEq(lossyItems['stations-unserved'].names, ['丁'], 'GTFS書出(損失): 使われない駅名');
eq(lossyItems['trains-no-stops'].count, 1, 'GTFS書出(損失): 停車のない列車');
eq(lossyItems['stops-state-changed'].count, 2, 'GTFS書出(損失): 状態を保持できない停車 (範囲内の経由なし + 未設定)');
eq(lossyItems['pass-arrival-dropped'].count, 1, 'GTFS書出(損失): 通過駅の着時刻');
eq(expLossy.report.trainCount, 3, 'GTFS書出(損失): 書き出された列車数');
eq(expLossy.report.diagramCount, 3, 'GTFS書出(損失): 書き出されたダイヤ数');

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
