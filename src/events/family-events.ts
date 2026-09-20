import { getDayYiJi, scoreDay, EVENT_WEIGHTS } from '../almanac/yiji';
import { parseDate } from '../utils/date';

// 参与人
export interface Participant {
  name: string;
  shengxiao: string;
}

// 一次改期记录
export interface DateChange {
  from: string;      // 先前定的那天
  to: string;        // 新改的那天
  reason: string;    // 改的原因
  changedAt: string; // 改期操作时间
}

// 定日子时自动带上的当天黄历快照
export interface EventAlmanac {
  yi: string[];
  ji: string[];
  chongShengxiao: string;
  score: number; // 吉凶分数
}

// 家里办过/要办的一件大事
export interface FamilyEvent {
  id: string;
  title: string;            // 什么事
  category: string;         // 事的类别
  date: string;             // 当前定下的日子 YYYY-MM-DD
  participants: Participant[];
  almanac: EventAlmanac;    // 定下来那天的宜忌/冲生肖/吉凶分数
  changes: DateChange[];    // 改期历史，按先后排列，改几次都能看出来
  createdAt: string;
}

export const EVENT_CATEGORIES = Object.keys(EVENT_WEIGHTS);

// 红白事分组：同组不冲，红事与白事同日互相犯冲
const HONG_SHI = ['嫁娶', '开业', '搬家'];
const BAI_SHI = ['安葬', '祭祀'];

export function categoriesConflict(a: string, b: string): boolean {
  if (a === b) return false;
  const aHong = HONG_SHI.includes(a);
  const bHong = HONG_SHI.includes(b);
  const aBai = BAI_SHI.includes(a);
  const bBai = BAI_SHI.includes(b);
  return (aHong && bBai) || (aBai && bHong);
}

// 取某天的黄历快照（定日子/改日子时调用）
export function snapshotAlmanac(date: string, category: string): EventAlmanac {
  const [y, m, d] = parseDate(date);
  const yiji = getDayYiJi(y, m, d);
  return {
    yi: yiji.yi,
    ji: yiji.ji,
    chongShengxiao: yiji.chongShengxiao,
    score: scoreDay(y, m, d, [category])
  };
}

// 校验一件事能否定在某天，返回问题列表（空数组 = 可以定）
export function validateEvent(
  date: string,
  category: string,
  participants: Participant[],
  existing: FamilyEvent[],
  excludeId?: string
): string[] {
  const problems: string[] = [];
  const almanac = snapshotAlmanac(date, category);

  // 同一天不许记两件互相犯冲的事
  for (const ev of existing) {
    if (ev.id === excludeId) continue;
    if (ev.date === date && categoriesConflict(category, ev.category)) {
      problems.push(
        `「${ev.title}」（${ev.category}）也定在 ${date}，${category}与${ev.category}红白相冲，同一天不能记两件犯冲的事`
      );
    }
  }

  // 参与人属相与当天所冲生肖相同的要拦下，并说明是哪一位
  if (almanac.chongShengxiao) {
    for (const p of participants) {
      if (p.shengxiao === almanac.chongShengxiao) {
        problems.push(
          `参与人「${p.name}」属${p.shengxiao}，正冲当日（冲${almanac.chongShengxiao}），请另择日子或调整参与人`
        );
      }
    }
  }

  return problems;
}

export interface NewEventInput {
  title: string;
  category: string;
  date: string;
  participants: Participant[];
}

// 记一笔新的事（校验不过会抛错，错误信息即拦截说明）
export function createEvent(input: NewEventInput, existing: FamilyEvent[], now: string = new Date().toISOString()): FamilyEvent {
  const title = input.title.trim();
  if (!title) throw new Error('请写清是什么事');
  if (!EVENT_CATEGORIES.includes(input.category)) throw new Error('请选择事的类别');
  if (!input.date) throw new Error('请选定日子');

  const participants = input.participants.filter(p => p.name.trim());
  const problems = validateEvent(input.date, input.category, participants, existing);
  if (problems.length > 0) throw new Error(problems.join('\n'));

  return {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    category: input.category,
    date: input.date,
    participants,
    almanac: snapshotAlmanac(input.date, input.category),
    changes: [],
    createdAt: now
  };
}

// 改日子：留下先前定的那天、新改的那天和改的原因，同时刷新当天黄历快照
export function rescheduleEvent(
  event: FamilyEvent,
  newDate: string,
  reason: string,
  existing: FamilyEvent[],
  now: string = new Date().toISOString()
): FamilyEvent {
  if (!newDate) throw new Error('请选定新日子');
  if (newDate === event.date) throw new Error('新改的日子与当前定的日子相同');
  if (!reason.trim()) throw new Error('请写清改期原因');

  const problems = validateEvent(newDate, event.category, event.participants, existing, event.id);
  if (problems.length > 0) throw new Error(problems.join('\n'));

  return {
    ...event,
    date: newDate,
    almanac: snapshotAlmanac(newDate, event.category),
    changes: [...event.changes, { from: event.date, to: newDate, reason: reason.trim(), changedAt: now }]
  };
}

// 年度统计：按类别算一年办了几回、都在哪些月份（按当前定的日子计）
export interface CategoryStat {
  category: string;
  count: number;
  months: number[];
}

export function yearlyStats(events: FamilyEvent[], year: number): CategoryStat[] {
  const map = new Map<string, Set<number>>();
  for (const ev of events) {
    const [y, m] = parseDate(ev.date);
    if (y !== year) continue;
    if (!map.has(ev.category)) map.set(ev.category, new Set());
    map.get(ev.category)!.add(m);
  }
  return Array.from(map.entries())
    .map(([category, months]) => ({
      category,
      count: events.filter(ev => {
        const [y] = parseDate(ev.date);
        return y === year && ev.category === category;
      }).length,
      months: Array.from(months).sort((a, b) => a - b)
    }))
    .sort((a, b) => b.count - a.count);
}

// ---- 本地存储 ----
const STORAGE_KEY = 'family-events-v1';

export function loadEvents(): FamilyEvent[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as FamilyEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: FamilyEvent[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 存储失败不阻断使用
  }
}
