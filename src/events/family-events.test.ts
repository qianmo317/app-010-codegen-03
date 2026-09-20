import { describe, it, expect } from 'vitest';
import {
  createEvent,
  rescheduleEvent,
  validateEvent,
  yearlyStats,
  categoriesConflict,
  snapshotAlmanac,
  FamilyEvent
} from './family-events';
import { getDayYiJi, scoreDay } from '../almanac/yiji';

const DAY1 = '2026-03-08';
const DAY2 = '2026-04-05';
const DAY3 = '2026-05-01';

function makeEvent(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'ev_test',
    title: '测试事',
    category: '搬家',
    date: DAY1,
    participants: [],
    almanac: snapshotAlmanac(DAY1, '搬家'),
    changes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('定日子自动带黄历', () => {
  it('创建时自动带上当天宜忌、冲生肖和吉凶分数', () => {
    const ev = createEvent(
      { title: '乔迁', category: '搬家', date: DAY1, participants: [] },
      []
    );
    const yiji = getDayYiJi(2026, 3, 8);
    expect(ev.almanac.yi).toEqual(yiji.yi);
    expect(ev.almanac.ji).toEqual(yiji.ji);
    expect(ev.almanac.chongShengxiao).toBe(yiji.chongShengxiao);
    expect(ev.almanac.score).toBe(scoreDay(2026, 3, 8, ['搬家']));
  });

  it('缺事名/类别/日子要拦', () => {
    expect(() => createEvent({ title: ' ', category: '搬家', date: DAY1, participants: [] }, [])).toThrow('请写清是什么事');
    expect(() => createEvent({ title: 'x', category: '理发', date: DAY1, participants: [] }, [])).toThrow('请选择事的类别');
    expect(() => createEvent({ title: 'x', category: '搬家', date: '', participants: [] }, [])).toThrow('请选定日子');
  });
});

describe('改期留痕', () => {
  it('改期后留下先前定的那天、新改的那天和原因，并刷新黄历快照', () => {
    const ev = makeEvent();
    const moved = rescheduleEvent(ev, DAY2, '老人身体不适', [ev], '2026-02-01T00:00:00.000Z');
    expect(moved.date).toBe(DAY2);
    expect(moved.changes).toHaveLength(1);
    expect(moved.changes[0]).toMatchObject({ from: DAY1, to: DAY2, reason: '老人身体不适' });
    expect(moved.almanac).toEqual(snapshotAlmanac(DAY2, '搬家'));
  });

  it('同一件事改几次都能看出来', () => {
    let ev = makeEvent();
    ev = rescheduleEvent(ev, DAY2, '第一次改', [ev]);
    ev = rescheduleEvent(ev, DAY3, '第二次改', [ev]);
    expect(ev.changes).toHaveLength(2);
    expect(ev.changes.map(c => `${c.from}->${c.to}`)).toEqual([
      `${DAY1}->${DAY2}`,
      `${DAY2}->${DAY3}`
    ]);
    expect(ev.date).toBe(DAY3);
  });

  it('改期必须写原因，且不能改成同一天', () => {
    const ev = makeEvent();
    expect(() => rescheduleEvent(ev, DAY2, '  ', [ev])).toThrow('请写清改期原因');
    expect(() => rescheduleEvent(ev, DAY1, '没改', [ev])).toThrow('相同');
  });
});

describe('同一天不许记两件犯冲的事', () => {
  it('红事与白事互冲', () => {
    expect(categoriesConflict('嫁娶', '安葬')).toBe(true);
    expect(categoriesConflict('开业', '祭祀')).toBe(true);
    expect(categoriesConflict('嫁娶', '搬家')).toBe(false);
    expect(categoriesConflict('安葬', '祭祀')).toBe(false);
    expect(categoriesConflict('嫁娶', '嫁娶')).toBe(false);
  });

  it('同日已有白事，再记红事要被拦下并说明', () => {
    const burial = makeEvent({ id: 'a', title: '祖母安葬', category: '安葬', date: DAY1 });
    expect(() =>
      createEvent({ title: '表兄成婚', category: '嫁娶', date: DAY1, participants: [] }, [burial])
    ).toThrow(/祖母安葬.*相冲/);
  });

  it('同日不犯冲的事可以记', () => {
    const move = makeEvent({ id: 'a', title: '乔迁', category: '搬家', date: DAY1 });
    const ev = createEvent({ title: '出嫁', category: '嫁娶', date: DAY1, participants: [] }, [move]);
    expect(ev.date).toBe(DAY1);
  });

  it('改期改到犯冲的那天也要拦', () => {
    const burial = makeEvent({ id: 'a', title: '祖母安葬', category: '安葬', date: DAY2 });
    const wedding = makeEvent({ id: 'b', title: '表兄成婚', category: '嫁娶', date: DAY1 });
    expect(() => rescheduleEvent(wedding, DAY2, '酒店档期', [burial, wedding])).toThrow(/相冲/);
  });
});

describe('参与人属相冲当日要拦', () => {
  it('属相正冲当日的参与人被点名拦下', () => {
    const chong = getDayYiJi(2026, 3, 8).chongShengxiao;
    const problems = validateEvent(DAY1, '搬家', [
      { name: '张三', shengxiao: chong },
      { name: '李四', shengxiao: chong === '鼠' ? '牛' : '鼠' }
    ], []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('张三');
    expect(problems[0]).toContain(chong);
    expect(problems[0]).not.toContain('李四');
  });

  it('创建时命中参与人相冲直接抛错', () => {
    const chong = getDayYiJi(2026, 3, 8).chongShengxiao;
    expect(() =>
      createEvent({ title: '乔迁', category: '搬家', date: DAY1, participants: [{ name: '王五', shengxiao: chong }] }, [])
    ).toThrow(/王五/);
  });
});

describe('年度统计', () => {
  it('按类别算一年办了几回、都在哪些月份', () => {
    const events = [
      makeEvent({ id: '1', category: '嫁娶', date: '2026-03-08' }),
      makeEvent({ id: '2', category: '嫁娶', date: '2026-10-02' }),
      makeEvent({ id: '3', category: '搬家', date: '2026-03-20' }),
      makeEvent({ id: '4', category: '搬家', date: '2025-05-01' }) // 去年，不计入
    ];
    const stats = yearlyStats(events, 2026);
    expect(stats).toHaveLength(2);
    const jiaqu = stats.find(s => s.category === '嫁娶')!;
    expect(jiaqu.count).toBe(2);
    expect(jiaqu.months).toEqual([3, 10]);
    const banjia = stats.find(s => s.category === '搬家')!;
    expect(banjia.count).toBe(1);
    expect(banjia.months).toEqual([3]);
    // 次数多的排前面
    expect(stats[0].category).toBe('嫁娶');
  });

  it('改期后按新日子统计', () => {
    let ev = makeEvent({ id: '1', category: '开业', date: '2026-01-10' });
    ev = rescheduleEvent(ev, '2026-06-18', '店铺装修延误', [ev]);
    const stats = yearlyStats([ev], 2026);
    expect(stats[0].months).toEqual([6]);
  });
});
