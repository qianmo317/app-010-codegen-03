import { getDayYiJi, scoreDay, EVENT_WEIGHTS } from './yiji';
import { solarToLunar } from './lunar';
import { parseDate } from '../utils/date';

// ==================== 数据模型 ====================

/** 参与人 */
export interface Participant {
  name: string;
  shengxiao: string; // 属相（鼠牛虎兔龙蛇马羊猴鸡狗猪）
}

/** 一次改期记录：先前定的那天、新改的那天、改的原因 */
export interface DateChange {
  fromDate: string;   // 先前定的日子 YYYY-MM-DD
  toDate: string;     // 新改的日子 YYYY-MM-DD
  reason: string;     // 改期原因
  changedAt: string;  // 改期操作时间 ISO
}

/** 定日子时自动带上的当日黄历快照 */
export interface AlmanacSnapshot {
  yi: string[];
  ji: string[];
  chongShengxiao: string; // 当日冲的生肖
  score: number;          // 吉凶分数 0-100
  ganZhi: string;         // 日柱干支
}

/** 家里办过的一件大事 */
export interface FamilyEvent {
  id: string;
  title: string;              // 什么事
  category: string;           // 事的类别（嫁娶/搬家/动土/开业/出行/安葬/祭祀）
  date: string;               // 现定的日子 YYYY-MM-DD
  participants: Participant[];// 都有谁参与
  almanac: AlmanacSnapshot;   // 定下来时自动带上的宜忌/冲生肖/吉凶分数
  changes: DateChange[];      // 改期历史，length 即改过几次
  createdAt: string;
}

/** 事的类别（与择日权重表一致） */
export const EVENT_CATEGORIES = Object.keys(EVENT_WEIGHTS);

// ==================== 犯冲规则 ====================

/**
 * 互相犯冲的事（红白相冲），同一天不许记两件。
 * 对称关系：安葬（白事）与各项喜事犯冲。
 */
const CONFLICT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['安葬', '嫁娶'],
  ['安葬', '搬家'],
  ['安葬', '开业'],
  ['安葬', '动土'],
  ['安葬', '出行'],
];

/** 类别 -> 与之犯冲的类别列表 */
export const CATEGORY_CONFLICTS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [a, b] of CONFLICT_PAIRS) {
    (map[a] ||= []).push(b);
    (map[b] ||= []).push(a);
  }
  return map;
})();

// ==================== 存储 ====================

const STORAGE_KEY = 'family-events-v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// 无 localStorage 环境（如测试）下退化为内存存储
const memoryStorage: StorageLike = (() => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
})();

function getStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // 忽略，走内存存储
  }
  return memoryStorage;
}

function loadEvents(): FamilyEvent[] {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: FamilyEvent[]): void {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(events));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ==================== 查询 ====================

/** 全部大事，按现定日期升序 */
export function listEvents(): FamilyEvent[] {
  return loadEvents().sort((a, b) => a.date.localeCompare(b.date));
}

export function getEvent(id: string): FamilyEvent | undefined {
  return loadEvents().find(e => e.id === id);
}

/** 清空（主要用于测试） */
export function clearAllEvents(): void {
  saveEvents([]);
}

// ==================== 黄历快照 ====================

/** 定日子时自动带上：当日宜忌、冲什么生肖、吉凶分数 */
export function buildAlmanacSnapshot(date: string, category: string): AlmanacSnapshot {
  const [y, m, d] = parseDate(date);
  const yiJi = getDayYiJi(y, m, d);
  const lunar = solarToLunar(y, m, d);
  return {
    yi: yiJi.yi,
    ji: yiJi.ji,
    chongShengxiao: yiJi.chongShengxiao,
    score: scoreDay(y, m, d, [category]),
    ganZhi: lunar.dayGanZhi,
  };
}

// ==================== 校验 ====================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 参与人里属相与当天相冲的（返回是哪些位冲上了） */
export function findClashingParticipants(date: string, participants: Participant[]): Participant[] {
  const [y, m, d] = parseDate(date);
  const { chongShengxiao } = getDayYiJi(y, m, d);
  return participants.filter(p => p.shengxiao === chongShengxiao);
}

/** 同一天已记的、与给定类别犯冲的事 */
export function findSameDayConflicts(date: string, category: string, excludeId?: string): FamilyEvent[] {
  const conflicts = CATEGORY_CONFLICTS[category] || [];
  if (conflicts.length === 0) return [];
  return loadEvents().filter(e => e.id !== excludeId && e.date === date && conflicts.includes(e.category));
}

function clashError(date: string, clashing: Participant[]): string {
  const [y, m, d] = parseDate(date);
  const { chongShengxiao } = getDayYiJi(y, m, d);
  const who = clashing.map(p => `「${p.name}」（属${p.shengxiao}）`).join('、');
  return `${date} 当日冲${chongShengxiao}，参与者${who}与日子相冲，请另择日期`;
}

function conflictError(category: string, conflicts: FamilyEvent[]): string[] {
  return conflicts.map(c => `同日已有「${c.title}」（${c.category}），与「${category}」犯冲，不能记在同一天`);
}

// ==================== 记账 / 改期 / 删除 ====================

export type SaveResult = { ok: true; event: FamilyEvent } | { ok: false; errors: string[] };

export interface NewEventInput {
  title: string;
  category: string;
  date: string;
  participants: Participant[];
}

/** 记一笔大事 */
export function addEvent(input: NewEventInput): SaveResult {
  const title = input.title.trim();
  const participants = input.participants.filter(p => p.name.trim());

  const errors: string[] = [];
  if (!title) errors.push('请填写什么事');
  if (!EVENT_CATEGORIES.includes(input.category)) errors.push('请选择事的类别');
  if (!DATE_RE.test(input.date)) errors.push('请选定日子');
  if (errors.length > 0) return { ok: false, errors };

  // 参与人属相跟当天冲上了要拦一下
  const clashing = findClashingParticipants(input.date, participants);
  if (clashing.length > 0) errors.push(clashError(input.date, clashing));

  // 同一天不许记两件互相犯冲的事
  errors.push(...conflictError(input.category, findSameDayConflicts(input.date, input.category)));

  if (errors.length > 0) return { ok: false, errors };

  const event: FamilyEvent = {
    id: genId(),
    title,
    category: input.category,
    date: input.date,
    participants,
    almanac: buildAlmanacSnapshot(input.date, input.category),
    changes: [],
    createdAt: new Date().toISOString(),
  };
  const events = loadEvents();
  events.push(event);
  saveEvents(events);
  return { ok: true, event };
}

/** 改日子：留下先前定的那天、新改的那天和改的原因，并重算当日黄历快照 */
export function changeEventDate(id: string, newDate: string, reason: string): SaveResult {
  const events = loadEvents();
  const event = events.find(e => e.id === id);
  if (!event) return { ok: false, errors: ['未找到这件事'] };

  const errors: string[] = [];
  if (!DATE_RE.test(newDate)) errors.push('请选定新日子');
  if (!reason.trim()) errors.push('请填写改期原因');
  if (errors.length === 0 && newDate === event.date) errors.push('新日子与现定的是同一天');
  if (errors.length > 0) return { ok: false, errors };

  // 新日子同样要过两道校验
  const clashing = findClashingParticipants(newDate, event.participants);
  if (clashing.length > 0) errors.push(clashError(newDate, clashing));
  errors.push(...conflictError(event.category, findSameDayConflicts(newDate, event.category, id)));
  if (errors.length > 0) return { ok: false, errors };

  event.changes.push({
    fromDate: event.date,
    toDate: newDate,
    reason: reason.trim(),
    changedAt: new Date().toISOString(),
  });
  event.date = newDate;
  event.almanac = buildAlmanacSnapshot(newDate, event.category);
  saveEvents(events);
  return { ok: true, event };
}

export function removeEvent(id: string): boolean {
  const events = loadEvents();
  const next = events.filter(e => e.id !== id);
  if (next.length === events.length) return false;
  saveEvents(next);
  return true;
}

// ==================== 年度统计 ====================

export interface CategoryStat {
  category: string;
  count: number;    // 这一年办了几回
  months: number[]; // 都在哪些月份（去重升序）
}

/** 按事的类别统计某一年：办了几回、都在哪些月份 */
export function getYearStats(year: number): CategoryStat[] {
  const byCategory = new Map<string, { count: number; months: Set<number> }>();
  for (const e of loadEvents()) {
    const [y, m] = e.date.split('-').map(Number);
    if (y !== year) continue;
    let stat = byCategory.get(e.category);
    if (!stat) {
      stat = { count: 0, months: new Set() };
      byCategory.set(e.category, stat);
    }
    stat.count++;
    stat.months.add(m);
  }
  return Array.from(byCategory.entries())
    .map(([category, s]) => ({
      category,
      count: s.count,
      months: Array.from(s.months).sort((a, b) => a - b),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
