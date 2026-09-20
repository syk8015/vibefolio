// 폰 웹푸시 — claudehelp의 vapid.json/sub.json을 그대로 사용 (warmup notify.js 패턴).
// 파일이 없으면 조용히 넘어간다(알림은 선택 기능).
import fs from 'node:fs';
import path from 'node:path';
import { CLAUDEHELP } from './paths.js';

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function sendPush({ title, body, tag = 'dispatch' }) {
  const vapid = loadJson(path.join(CLAUDEHELP, 'vapid.json'));
  const sub = loadJson(path.join(CLAUDEHELP, 'sub.json'));
  if (!vapid || !sub) return { sent: false, reason: 'no-claudehelp-pairing' };
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails('mailto:notify@claudehelp.app', vapid.publicKey, vapid.privateKey);
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, tag }));
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.statusCode || e.message };
  }
}
