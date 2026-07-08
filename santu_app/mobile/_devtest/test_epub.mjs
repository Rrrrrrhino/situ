/**
 * EPUB 解析自测（Node 环境）
 * 运行: node _devtest/test_epub.mjs
 */
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { parseEpubFromArrayBuffer } from '../js/core/extract.js';

// 注入浏览器 DOM API（Node 没有 DOMParser）
const { window: jsdomWin } = new JSDOM('');
global.DOMParser = jsdomWin.DOMParser;

const EPUB_DIR = '/Users/yizhang/Documents/situ/books/';
const books = [
  '2d5f87fc7390.epub',
  '37c1074d86a1.epub',
  '807dff52fc19.epub',
  'ba2e1a0557be.epub',
  'd87333f486e0.epub',
  'ea6397bef0fe.epub',
];

let passed = 0, failed = 0;
for (const name of books) {
  const path = EPUB_DIR + name;
  let buf;
  try {
    const bytes = readFileSync(path);
    buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch(e) {
    console.error(`找不到文件: ${path}`);
    failed++;
    continue;
  }
  try {
    const result = await parseEpubFromArrayBuffer(buf);
    const { title, chapters } = result;
    const ch0 = chapters[0];
    const preview = ch0
      ? ch0.blocks.slice(0,2).map(b => `[${b.type}] ${b.text.slice(0,40)}`)
      : ['(无blocks)'];
    const hasEmpty = chapters.some(c => c.blocks.length === 0);
    console.log(`\n=== ${name} ===`);
    console.log(`书名: ${title}`);
    console.log(`章节数: ${chapters.length}`);
    console.log(`首章标题: ${ch0 ? ch0.title : '无'}`);
    console.log(`首章前2块: ${preview.join(' | ')}`);
    console.log(`有空章(blocks=0): ${hasEmpty}`);
    if (!ch0 || chapters.length === 0) {
      console.warn('  ⚠️ 警告: 章节为空');
      failed++;
    } else {
      passed++;
    }
  } catch(e) {
    console.error(`\n=== ${name} 解析出错: ${e.message}`);
    console.error(e.stack);
    failed++;
  }
}
console.log(`\n── 合计 passed=${passed} failed=${failed} ──`);
