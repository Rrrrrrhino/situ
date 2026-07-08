/**
 * store.js IndexedDB round-trip 测试（fake-indexeddb）
 * 运行: node _devtest/test_store.mjs
 */
import { IDBFactory } from 'fake-indexeddb';
import {
  setIDBFactory,
  openDB,
  libraryList, libraryUpsert, libraryDelete,
  archiveGet, archivePut, archiveDelete,
  vocabGetAll, vocabGet, vocabPut, vocabDelete, vocabImportBatch,
  settingsGet, settingsPut,
} from '../js/core/store.js';

// 注入 fake-indexeddb
setIDBFactory(new IDBFactory());

let passed = 0, failed = 0;
function ok(label, cond, actual) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}  actual=${JSON.stringify(actual)}`); failed++; }
}

// ── library ─────────────────────────────────────────────────────────────────
console.log('\n── library ──');
await libraryUpsert({ id: 'doc1', mode: 'book', title: '测试书', source: 'test.epub', saved_at: 1000, level: 'cet4-6', vocab_count: 50 });
await libraryUpsert({ id: 'doc2', mode: 'article', title: '测试文章', source: 'http://x.com', saved_at: 2000, level: 'cet4-6', vocab_count: 10 });

const lib = await libraryList();
ok('libraryList 返回 2 条', lib.length === 2, lib.length);
ok('libraryList 按 saved_at 倒序（doc2 在前）', lib[0].id === 'doc2', lib[0].id);

// upsert 去重
await libraryUpsert({ id: 'doc1', mode: 'book', title: '测试书(改)', source: 'test.epub', saved_at: 3000, level: 'cet4-6', vocab_count: 60 });
const lib2 = await libraryList();
ok('upsert 去重（还是 2 条）', lib2.length === 2, lib2.length);
ok('upsert 更新了 title', lib2.find(x=>x.id==='doc1').title === '测试书(改)', lib2.find(x=>x.id==='doc1').title);
ok('upsert 更新后倒序（doc1 在前，saved_at=3000）', lib2[0].id === 'doc1', lib2[0].id);

await libraryDelete('doc1');
const lib3 = await libraryList();
ok('delete 后只剩 1 条', lib3.length === 1, lib3.length);

// ── archives ────────────────────────────────────────────────────────────────
console.log('\n── archives ──');
const arc = { id: 'arc1', mode: 'book', title: '书A', source: 's', chapters: [{title:'ch1',blocks:[{type:'p',text:'hello'}]}], chapter_idx: 0, saved_at: 999 };
await archivePut(arc);
const got = await archiveGet('arc1');
ok('archivePut + archiveGet 一致', got && got.title === '书A', got && got.title);
ok('archiveGet 章节数', got && got.chapters.length === 1, got && got.chapters.length);

await archivePut({ ...arc, chapter_idx: 5 });
const got2 = await archiveGet('arc1');
ok('archivePut upsert 更新 chapter_idx', got2.chapter_idx === 5, got2.chapter_idx);

await archiveDelete('arc1');
const got3 = await archiveGet('arc1');
ok('archiveDelete 后 get 返回 undefined', got3 === undefined, got3);

// ── globalvocab ──────────────────────────────────────────────────────────────
console.log('\n── globalvocab ──');
await vocabPut({ key: 'serendipity', lemma: 'serendipity', kind: 'word', clicks: 1, star: false, added_at: 100, last_seen: 100, first_added: 100, sources: [] });
const v = await vocabGet('serendipity');
ok('vocabPut + vocabGet', v && v.key === 'serendipity', v && v.key);

await vocabPut({ ...v, clicks: 5, star: true });
const v2 = await vocabGet('serendipity');
ok('vocabPut upsert 更新 clicks', v2.clicks === 5, v2.clicks);

const all = await vocabGetAll();
ok('vocabGetAll 含 serendipity', all.some(e => e.key === 'serendipity'), all.length);

await vocabDelete('serendipity');
const v3 = await vocabGet('serendipity');
ok('vocabDelete 后 get 返回 undefined', v3 === undefined, v3);

// ── vocab import merge ───────────────────────────────────────────────────────
console.log('\n── vocab import merge ──');
await vocabPut({ key: 'merge', lemma: 'merge', kind: 'word', clicks: 3, star: true, known: false, added_at: 1, last_seen: 1, first_added: 1, sources: [] });
const imported = [{ key: 'merge', lemma: 'merge', kind: 'word', clicks: 1, star: false, known: true, added_at: 2, last_seen: 2, first_added: 2, sources: [] }];
await vocabImportBatch(imported, 'merge');
const merged = await vocabGet('merge');
ok('merge: star OR（true OR false = true）', merged.star === true, merged.star);
ok('merge: known OR（false OR true = true）', merged.known === true, merged.known);
ok('merge: clicks 取较大值（3 vs 1 = 3）', merged.clicks === 3, merged.clicks);

// ── settings ─────────────────────────────────────────────────────────────────
console.log('\n── settings ──');
await settingsPut('level', 'ielts');
const lv = await settingsGet('level', 'cet4-6');
ok('settingsPut + settingsGet', lv === 'ielts', lv);

const lv2 = await settingsGet('nonexist', 'default_val');
ok('settingsGet 缺省值', lv2 === 'default_val', lv2);

console.log(`\n── 合计 passed=${passed} failed=${failed} ──`);
