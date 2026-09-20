import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { SHENG_XIAO } from '../almanac/constants';
import {
  FamilyEvent,
  Participant,
  EVENT_CATEGORIES,
  createEvent,
  rescheduleEvent,
  yearlyStats,
  loadEvents,
  saveEvents
} from '../events/family-events';

export function renderEvents(app: HTMLElement) {
  clearElement(app);
  app.className = 'page events-page';

  let events = loadEvents();

  // 头部
  const header = createElement('div', 'page-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/'));
  const title = createElement('h1', 'page-title', '家事记录');
  header.append(backBtn, title);

  // 提示信息区（拦截说明也显示在这里）
  const messageBox = createElement('div', 'event-message');
  messageBox.style.display = 'none';

  function showMessage(text: string, isError: boolean) {
    messageBox.textContent = text;
    messageBox.className = `event-message ${isError ? 'error' : 'ok'}`;
    messageBox.style.display = 'block';
  }
  function hideMessage() {
    messageBox.style.display = 'none';
  }

  // ---- 记一笔新事 ----
  const form = createElement('div', 'pick-form');
  form.appendChild(createElement('h3', 'form-title', '记一笔'));

  const titleSection = createElement('div', 'form-section');
  titleSection.innerHTML = `
    <label>什么事</label>
    <input type="text" id="ev-title" placeholder="如：表兄成婚、老宅乔迁">
  `;

  const categorySection = createElement('div', 'form-section');
  categorySection.innerHTML = '<label>事的类别</label>';
  const categoryGrid = createElement('div', 'events-grid');
  let selectedCategory = '';
  const categoryBtns: HTMLButtonElement[] = [];
  EVENT_CATEGORIES.forEach(cat => {
    const btn = createElement('button', 'event-btn', cat) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      selectedCategory = cat;
      categoryBtns.forEach(b => b.classList.toggle('selected', b === btn));
    });
    categoryBtns.push(btn);
    categoryGrid.appendChild(btn);
  });
  categorySection.appendChild(categoryGrid);

  const dateSection = createElement('div', 'form-section');
  dateSection.innerHTML = `
    <label>定在哪天</label>
    <div class="date-range"><input type="date" id="ev-date"></div>
  `;

  // 参与人（姓名 + 属相）
  const participantsSection = createElement('div', 'form-section');
  participantsSection.innerHTML = '<label>都有谁参与（姓名 + 属相）</label>';
  const participantsList = createElement('div', 'participants-list');

  function addParticipantRow(name = '', shengxiao = '') {
    const row = createElement('div', 'participant-row');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '姓名';
    nameInput.value = name;
    const sxSelect = document.createElement('select');
    sxSelect.innerHTML = '<option value="">属相</option>' +
      SHENG_XIAO.map(s => `<option value="${s}" ${s === shengxiao ? 'selected' : ''}>${s}</option>`).join('');
    const removeBtn = createElement('button', 'participant-remove', '×') as HTMLButtonElement;
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => row.remove());
    row.append(nameInput, sxSelect, removeBtn);
    participantsList.appendChild(row);
  }

  const addParticipantBtn = createElement('button', 'add-participant-btn', '+ 添加参与人') as HTMLButtonElement;
  addParticipantBtn.type = 'button';
  addParticipantBtn.addEventListener('click', () => addParticipantRow());
  participantsSection.append(participantsList, addParticipantBtn);
  addParticipantRow();

  function readParticipants(): Participant[] {
    return Array.from(participantsList.querySelectorAll('.participant-row')).map(row => {
      const [nameInput, sxSelect] = Array.from(row.children) as [HTMLInputElement, HTMLSelectElement];
      return { name: nameInput.value.trim(), shengxiao: sxSelect.value };
    }).filter(p => p.name);
  }

  const submitBtn = createElement('button', 'submit-btn', '定下这件事');
  submitBtn.addEventListener('click', () => {
    hideMessage();
    const titleInput = (document.getElementById('ev-title') as HTMLInputElement).value;
    const dateInput = (document.getElementById('ev-date') as HTMLInputElement).value;
    try {
      const ev = createEvent(
        { title: titleInput, category: selectedCategory, date: dateInput, participants: readParticipants() },
        events
      );
      events = [...events, ev];
      saveEvents(events);
      (document.getElementById('ev-title') as HTMLInputElement).value = '';
      (document.getElementById('ev-date') as HTMLInputElement).value = '';
      selectedCategory = '';
      categoryBtns.forEach(b => b.classList.remove('selected'));
      participantsList.innerHTML = '';
      addParticipantRow();
      showMessage(`已记下「${ev.title}」，定在 ${ev.date}（冲${ev.almanac.chongShengxiao || '无'} · ${ev.almanac.score}分）`, false);
      renderList();
      renderStats();
    } catch (err) {
      showMessage((err as Error).message, true);
    }
  });

  form.append(titleSection, categorySection, dateSection, participantsSection, submitBtn);

  // ---- 家事清单 ----
  const listArea = createElement('div', 'event-list-area');

  function renderList() {
    clearElement(listArea);
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      listArea.appendChild(createElement('div', 'empty-tip', '还没有记下任何事，先在上面记一笔吧'));
      return;
    }
    sorted.forEach(ev => listArea.appendChild(createEventCard(ev)));
  }

  function createEventCard(ev: FamilyEvent): HTMLElement {
    const card = createElement('div', 'card event-card');

    const head = createElement('div', 'event-card-head');
    head.innerHTML = `
      <span class="event-title">${escapeHtml(ev.title)}</span>
      <span class="event-category">${ev.category}</span>
      <span class="event-score">吉凶 ${ev.almanac.score} 分</span>
    `;

    const dateLine = createElement('div', 'event-date-line');
    dateLine.innerHTML = `定在 <b>${ev.date}</b>　冲${ev.almanac.chongShengxiao || '无'}`;

    // 参与人
    const people = createElement('div', 'event-people');
    if (ev.participants.length > 0) {
      people.innerHTML = '参与：' + ev.participants
        .map(p => `<span class="person-tag">${escapeHtml(p.name)}${p.shengxiao ? `（属${p.shengxiao}）` : ''}</span>`)
        .join('');
    } else {
      people.textContent = '参与：未记';
    }

    // 当天宜忌
    const yiji = createElement('div', 'event-yiji');
    yiji.innerHTML = `
      <div class="event-yiji-row"><span class="yiji-label yi">宜</span>${ev.almanac.yi.slice(0, 6).map(y => `<span class="yi-tag">${y}</span>`).join('')}</div>
      <div class="event-yiji-row"><span class="yiji-label ji">忌</span>${ev.almanac.ji.slice(0, 6).map(j => `<span class="ji-tag">${j}</span>`).join('')}</div>
    `;

    card.append(head, dateLine, people, yiji);

    // 改期历史：改几次都能看出来
    if (ev.changes.length > 0) {
      const history = createElement('div', 'change-history');
      history.appendChild(createElement('div', 'change-history-title', `改过 ${ev.changes.length} 次日子`));
      ev.changes.forEach((c, i) => {
        const item = createElement('div', 'change-item');
        item.innerHTML = `第${i + 1}次：${c.from} → ${c.to}（${escapeHtml(c.reason)}）`;
        history.appendChild(item);
      });
      card.appendChild(history);
    }

    // 操作：改期 / 删除
    const actions = createElement('div', 'event-actions');
    const rescheduleBtn = createElement('button', 'nav-btn', '改日子');
    const deleteBtn = createElement('button', 'nav-btn danger', '删除');
    actions.append(rescheduleBtn, deleteBtn);
    card.appendChild(actions);

    // 改期内联表单
    const rescheduleForm = createElement('div', 'reschedule-form');
    rescheduleForm.style.display = 'none';
    rescheduleForm.innerHTML = `
      <div class="date-range">
        <input type="date" class="rs-date">
        <input type="text" class="rs-reason" placeholder="改期原因（必填）">
      </div>
      <div class="rs-error"></div>
      <div class="rs-btns">
        <button class="submit-btn rs-ok">确认改期</button>
        <button class="nav-btn rs-cancel">取消</button>
      </div>
    `;
    rescheduleBtn.addEventListener('click', () => {
      rescheduleForm.style.display = rescheduleForm.style.display === 'none' ? 'block' : 'none';
    });
    rescheduleForm.querySelector('.rs-cancel')!.addEventListener('click', () => {
      rescheduleForm.style.display = 'none';
    });
    rescheduleForm.querySelector('.rs-ok')!.addEventListener('click', () => {
      const newDate = (rescheduleForm.querySelector('.rs-date') as HTMLInputElement).value;
      const reason = (rescheduleForm.querySelector('.rs-reason') as HTMLInputElement).value;
      const errBox = rescheduleForm.querySelector('.rs-error') as HTMLElement;
      try {
        const moved = rescheduleEvent(ev, newDate, reason, events);
        events = events.map(e => (e.id === ev.id ? moved : e));
        saveEvents(events);
        hideMessage();
        renderList();
        renderStats();
      } catch (err) {
        errBox.textContent = (err as Error).message;
      }
    });
    card.appendChild(rescheduleForm);

    deleteBtn.addEventListener('click', () => {
      if (!confirm(`确定删除「${ev.title}」这笔记录吗？`)) return;
      events = events.filter(e => e.id !== ev.id);
      saveEvents(events);
      renderList();
      renderStats();
    });

    return card;
  }

  // ---- 年度统计 ----
  const statsCard = createElement('div', 'card stats-card');
  const statsBody = createElement('div', 'stats-body');

  function renderStats() {
    clearElement(statsCard);
    clearElement(statsBody);
    statsCard.appendChild(createElement('h3', '', '年度统计'));

    const years = Array.from(new Set(events.map(e => Number(e.date.slice(0, 4))))).sort((a, b) => b - a);
    if (years.length === 0) {
      statsCard.appendChild(createElement('div', 'empty-tip', '记下事情后这里会按类别统计一年办了几回'));
      return;
    }

    const yearRow = createElement('div', 'stats-year-row');
    yearRow.appendChild(createElement('span', '', '年份：'));
    const yearSelect = document.createElement('select');
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}年</option>`).join('');
    yearRow.appendChild(yearSelect);
    statsCard.append(yearRow, statsBody);

    function renderYear() {
      clearElement(statsBody);
      const year = Number(yearSelect.value);
      const stats = yearlyStats(events, year);
      if (stats.length === 0) {
        statsBody.appendChild(createElement('div', 'empty-tip', `${year}年没有记录`));
        return;
      }
      const table = createElement('div', 'stats-table');
      table.innerHTML = `
        <div class="stats-row stats-head">
          <span>类别</span><span>办了几回</span><span>都在哪些月份</span>
        </div>
      `;
      stats.forEach(s => {
        const row = createElement('div', 'stats-row');
        row.innerHTML = `<span>${s.category}</span><span>${s.count} 回</span><span>${s.months.map(m => `${m}月`).join('、')}</span>`;
        table.appendChild(row);
      });
      statsBody.appendChild(table);
    }

    yearSelect.addEventListener('change', renderYear);
    renderYear();
  }

  app.append(header, messageBox, form, listArea, statsCard);
  renderList();
  renderStats();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string));
}
