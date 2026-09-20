import { describe, it, expect, beforeEach } from 'vitest';
import {
  addEvent,
  changeEventDate,
  clearAllEvents,
  findClashingParticipants,
  findSameDayConflicts,
  getYearStats,
  listEvents,
  removeEvent,
} from './family-events';
import { getDayYiJi, scoreDay } from './yiji';
import { SHENG_XIAO } from './constants';
import { parseDate } from '../utils/date';

beforeEach(() => {
  clearAllEvents();
});

describe('记一笔大事', () => {
  it('定下来时自动带上当天宜忌、冲生肖和吉凶分数', () => {
    const date = '2026-10-01';
    const result = addEvent({
      title: '老大结婚',
      category: '嫁娶',
      date,
      participants: [{ name: '爸', shengxiao: '鼠' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [y, m, d] = parseDate(date);
    const yiJi = getDayYiJi(y, m, d);
    expect(result.event.almanac.yi).toEqual(yiJi.yi);
    expect(result.event.almanac.ji).toEqual(yiJi.ji);
    expect(result.event.almanac.chongShengxiao).toBe(yiJi.chongShengxiao);
    expect(result.event.almanac.score).toBe(scoreDay(y, m, d, ['嫁娶']));
    expect(result.event.changes).toHaveLength(0);
  });

  it('事由、类别、日子缺一不可', () => {
    expect(addEvent({ title: ' ', category: '嫁娶', date: '2026-10-01', participants: [] })).toMatchObject({ ok: false });
    expect(addEvent({ title: 'x', category: '理发', date: '2026-10-01', participants: [] })).toMatchObject({ ok: false });
    expect(addEvent({ title: 'x', category: '嫁娶', date: '', participants: [] })).toMatchObject({ ok: false });
  });
});

describe('参与人属相与当天相冲要拦', () => {
  it('拦下并说明是哪一位冲的', () => {
    const date = '2026-10-01';
    const [y, m, d] = parseDate(date);
    const chong = getDayYiJi(y, m, d).chongShengxiao;

    const result = addEvent({
      title: '搬家',
      category: '搬家',
      date,
      participants: [
        { name: '三叔', shengxiao: chong },
        { name: '妈', shengxiao: SHENG_XIAO.find(s => s !== chong)! },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('')).toContain('三叔');
    expect(result.errors.join('')).toContain(`冲${chong}`);
    expect(result.errors.join('')).not.toContain('「妈」');
    expect(listEvents()).toHaveLength(0);
  });

  it('没人相冲就能记下', () => {
    const date = '2026-10-02';
    const [y, m, d] = parseDate(date);
    const chong = getDayYiJi(y, m, d).chongShengxiao;
    const safe = SHENG_XIAO.find(s => s !== chong)!;

    const result = addEvent({
      title: '搬家',
      category: '搬家',
      date,
      participants: [{ name: '妈', shengxiao: safe }],
    });
    expect(result.ok).toBe(true);
    expect(findClashingParticipants(date, [{ name: '妈', shengxiao: safe }])).toHaveLength(0);
  });
});

describe('同一天不许记两件互相犯冲的事', () => {
  const date = '2026-10-01';

  it('红白相冲被拦下并说明', () => {
    expect(addEvent({ title: '老大结婚', category: '嫁娶', date, participants: [] }).ok).toBe(true);

    const result = addEvent({ title: '祖坟迁葬', category: '安葬', date, participants: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('')).toContain('老大结婚');
    expect(result.errors.join('')).toContain('犯冲');
    expect(findSameDayConflicts(date, '安葬')).toHaveLength(1);
  });

  it('不犯冲的事可以记在同一天', () => {
    expect(addEvent({ title: '老大结婚', category: '嫁娶', date, participants: [] }).ok).toBe(true);
    expect(addEvent({ title: '清明祭扫', category: '祭祀', date, participants: [] }).ok).toBe(true);
    expect(listEvents()).toHaveLength(2);
  });
});

describe('改日子', () => {
  it('留下先前定的那天、新改的那天和原因，改几次能看出来', () => {
    const added = addEvent({ title: '新店开张', category: '开业', date: '2026-05-01', participants: [] });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const id = added.event.id;

    const r1 = changeEventDate(id, '2026-05-08', '酒店没档期');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.event.date).toBe('2026-05-08');
    expect(r1.event.changes).toHaveLength(1);
    expect(r1.event.changes[0]).toMatchObject({
      fromDate: '2026-05-01',
      toDate: '2026-05-08',
      reason: '酒店没档期',
    });

    const r2 = changeEventDate(id, '2026-05-18', '长辈重新挑的日子');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.event.changes).toHaveLength(2);
    expect(r2.event.changes[1].fromDate).toBe('2026-05-08');
    expect(r2.event.changes[1].toDate).toBe('2026-05-18');

    // 改期后黄历快照按新日子重算
    const [y, m, d] = parseDate('2026-05-18');
    expect(r2.event.almanac.score).toBe(scoreDay(y, m, d, ['开业']));
    expect(r2.event.almanac.chongShengxiao).toBe(getDayYiJi(y, m, d).chongShengxiao);
  });

  it('空原因、同一天、新日子犯冲都要拦', () => {
    const a = addEvent({ title: '迁葬', category: '安葬', date: '2026-06-01', participants: [] });
    const b = addEvent({ title: '老二结婚', category: '嫁娶', date: '2026-06-10', participants: [] });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(changeEventDate(b.event.id, '2026-06-12', ' ')).toMatchObject({ ok: false });
    expect(changeEventDate(b.event.id, '2026-06-10', '没变化')).toMatchObject({ ok: false });

    // 改到与安葬同一天 → 犯冲，拦
    const clash = changeEventDate(b.event.id, '2026-06-01', '想凑一起');
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.errors.join('')).toContain('犯冲');

    // 改到参与人相冲的日子 → 拦
    const [y, m, d] = parseDate('2026-06-20');
    const chong = getDayYiJi(y, m, d).chongShengxiao;
    const c = addEvent({
      title: '出门远行',
      category: '出行',
      date: '2026-06-15',
      participants: [{ name: '三叔', shengxiao: chong }],
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const blocked = changeEventDate(c.event.id, '2026-06-20', '车票改签');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errors.join('')).toContain('三叔');
  });
});

describe('年度统计', () => {
  it('按类别算一年办了几回、都在哪些月份', () => {
    addEvent({ title: '婚事1', category: '嫁娶', date: '2026-03-01', participants: [] });
    addEvent({ title: '婚事2', category: '嫁娶', date: '2026-03-15', participants: [] });
    addEvent({ title: '婚事3', category: '嫁娶', date: '2026-10-01', participants: [] });
    addEvent({ title: '乔迁', category: '搬家', date: '2026-07-20', participants: [] });
    addEvent({ title: '跨年的事', category: '嫁娶', date: '2027-01-01', participants: [] });

    const stats = getYearStats(2026);
    const marry = stats.find(s => s.category === '嫁娶');
    const move = stats.find(s => s.category === '搬家');

    expect(marry).toMatchObject({ count: 3, months: [3, 10] });
    expect(move).toMatchObject({ count: 1, months: [7] });
    expect(getYearStats(2027).find(s => s.category === '嫁娶')).toMatchObject({ count: 1, months: [1] });
    expect(getYearStats(2028)).toHaveLength(0);
  });
});

describe('删除', () => {
  it('删掉后不再占用同日的犯冲位', () => {
    const a = addEvent({ title: '老大结婚', category: '嫁娶', date: '2026-10-01', participants: [] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    expect(removeEvent(a.event.id)).toBe(true);
    expect(listEvents()).toHaveLength(0);
    expect(addEvent({ title: '迁葬', category: '安葬', date: '2026-10-01', participants: [] }).ok).toBe(true);
  });
});
