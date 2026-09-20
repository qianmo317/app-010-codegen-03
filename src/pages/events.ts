import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { SHENG_XIAO } from '../almanac/constants';
import {
  EVENT_CATEGORIES,
  FamilyEvent,
  addEvent,
  changeEventDate,
  getYearStats,
  listEvents,
  removeEvent,
} from '../almanac/family-events';

export function renderEvents(app: HTMLElement) {
  clearElement(app);
  app.className = 'page events-page';

  // 头部
  const header = createElement('div', 'page-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/'));
  const title = createElement('h1', 'page-title', '家中大事记');
  header.append(backBtn, title);

  const statsArea = createElement('div', 'stats-area');
  const formArea = createElement('div', 'form-area');
  const listArea = createElement('div', 'list-area');

  app.append(header, statsArea, formArea, listArea);

  renderStats(statsArea);
  renderForm(formArea, () => {
    renderStats(statsArea);
    renderList(listArea);
  });
  renderList(listArea);
}

// ==================== 年度统计 ====================

function renderStats(container: HTMLElement) {
  clearElement(container);

  const card = createElement('div', 'card');
  card.appendChild(createElement('h3', '', '年度统计'));

  let year = new Date().getFullYear();
  const body = createElement('div');

  const nav = createElement('div', 'stats-nav');
  const prevBtn = createElement('button', 'nav-btn', '◀');
  const yearLabel = createElement('span', 'stats-year');
  const nextBtn = createElement('button', 'nav-btn', '▶');
  prevBtn.addEventListener('click', () => { year--; draw(); });
  nextBtn.addEventListener('click', () => { year++; draw(); });
  nav.append(prevBtn, yearLabel, nextBtn);

  function draw() {
    yearLabel.textContent = `${year}年`;
    clearElement(body);

    const stats = getYearStats(year);
    if (stats.length === 0) {
      body.appendChild(createElement('div', 'empty-tip', '这一年还没有记账'));
      return;
    }

    const table = createElement('table', 'stats-table');
    table.innerHTML = '<thead><tr><th>类别</th><th>办了几回</th><th>都在哪些月份</th></tr></thead>';
    const tbody = createElement('tbody');
    for (const s of stats) {
      const tr = createElement('tr');
      tr.innerHTML = `
        <td>${s.category}</td>
        <td>${s.count} 回</td>
        <td>${s.months.map(m => `${m}月`).join('、')}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  }

  card.append(nav, body);
  container.appendChild(card);
  draw();
}

// ==================== 记一笔 ====================

function renderForm(container: HTMLElement, onSaved: () => void) {
  clearElement(container);

  const card = createElement('div', 'card');
  card.appendChild(createElement('h3', '', '记一笔'));

  const msgBox = createElement('div', 'msg-box');
  msgBox.style.display = 'none';

  // 事由 + 类别
  const row1 = createElement('div', 'form-row');
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = '什么事（如：老大结婚）';
  const categorySelect = document.createElement('select');
  EVENT_CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });
  row1.append(titleInput, categorySelect);

  // 日子
  const row2 = createElement('div', 'form-row');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  row2.appendChild(createElement('span', 'form-label', '定在'));
  row2.appendChild(dateInput);

  // 参与人
  const participantsBox = createElement('div', 'participants-box');
  participantsBox.appendChild(createElement('div', 'form-label', '都有谁参与'));

  function addParticipantRow(name = '', shengxiao = SHENG_XIAO[0]) {
    const row = createElement('div', 'participant-row');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '称呼（如：爸）';
    nameInput.value = name;
    const sxSelect = document.createElement('select');
    SHENG_XIAO.forEach(sx => {
      const opt = document.createElement('option');
      opt.value = sx;
      opt.textContent = `属${sx}`;
      sxSelect.appendChild(opt);
    });
    sxSelect.value = shengxiao;
    const removeBtn = createElement('button', 'small-btn danger', '删');
    removeBtn.addEventListener('click', () => row.remove());
    row.append(nameInput, sxSelect, removeBtn);
    participantsBox.appendChild(row);
  }
  addParticipantRow();

  const addParticipantBtn = createElement('button', 'small-btn', '+ 加一位');
  addParticipantBtn.addEventListener('click', () => addParticipantRow());

  // 提交
  const submitBtn = createElement('button', 'submit-btn', '记下这件事');
  submitBtn.addEventListener('click', () => {
    const participants = Array.from(participantsBox.querySelectorAll('.participant-row')).map(row => {
      const [nameInput, sxSelect] = Array.from(row.children) as [HTMLInputElement, HTMLSelectElement, HTMLElement];
      return { name: nameInput.value.trim(), shengxiao: sxSelect.value };
    });

    const result = addEvent({
      title: titleInput.value,
      category: categorySelect.value,
      date: dateInput.value,
      participants,
    });

    if (result.ok) {
      showMsg(msgBox, 'success', [`已记下：${result.event.title}，定在 ${result.event.date}（${result.event.almanac.ganZhi}日，吉凶 ${result.event.almanac.score} 分）`]);
      titleInput.value = '';
      dateInput.value = '';
      onSaved();
    } else {
      showMsg(msgBox, 'error', result.errors);
    }
  });

  card.append(msgBox, row1, row2, participantsBox, addParticipantBtn, submitBtn);
  container.appendChild(card);
}

// ==================== 大事列表 ====================

function renderList(container: HTMLElement) {
  clearElement(container);

  const events = listEvents();
  if (events.length === 0) {
    container.appendChild(createElement('div', 'empty-tip', '还没有记账，先在上面记一笔吧'));
    return;
  }

  for (const event of events) {
    container.appendChild(createEventCard(event, () => renderList(container)));
  }
}

function createEventCard(event: FamilyEvent, onChanged: () => void): HTMLElement {
  const card = createElement('div', 'card event-card');

  const { almanac } = event;
  const participantsText = event.participants.length > 0
    ? event.participants.map(p => `${p.name}（属${p.shengxiao}）`).join('、')
    : '未登记';

  const head = createElement('div', 'event-card-head');
  head.innerHTML = `
    <span class="event-title">${event.title}</span>
    <span class="event-badge">${event.category}</span>
  `;

  const meta = createElement('div', 'event-meta');
  meta.innerHTML = `
    定在 <b>${event.date}</b>（${almanac.ganZhi}日） ·
    吉凶 <span class="event-score">${almanac.score} 分</span> ·
    冲${almanac.chongShengxiao || '无'}
  `;

  const yiji = createElement('div', 'yiji-tags event-yiji');
  yiji.innerHTML = `
    ${almanac.yi.slice(0, 5).map(y => `<span class="yi-tag">宜 ${y}</span>`).join('')}
    ${almanac.ji.slice(0, 5).map(j => `<span class="ji-tag">忌 ${j}</span>`).join('')}
  `;

  const participants = createElement('div', 'event-participants', `参与：${participantsText}`);

  card.append(head, meta, yiji, participants);

  // 改期历史：改过几次、先前定的那天、新改的那天、原因
  if (event.changes.length > 0) {
    const changeBox = createElement('div', 'change-list');
    changeBox.appendChild(createElement('div', 'change-count', `改过 ${event.changes.length} 次日子`));
    event.changes.forEach((c, i) => {
      const item = createElement('div', 'change-item');
      item.textContent = `第${i + 1}次：原定在 ${c.fromDate}，改到 ${c.toDate}，原因：${c.reason}`;
      changeBox.appendChild(item);
    });
    card.appendChild(changeBox);
  }

  // 操作区
  const actions = createElement('div', 'event-actions');
  const changeBtn = createElement('button', 'small-btn', '改日子');
  const deleteBtn = createElement('button', 'small-btn danger', '删除');
  actions.append(changeBtn, deleteBtn);

  const changeForm = createElement('div', 'change-form');
  changeForm.style.display = 'none';

  changeBtn.addEventListener('click', () => {
    changeForm.style.display = changeForm.style.display === 'none' ? 'block' : 'none';
  });

  deleteBtn.addEventListener('click', () => {
    if (confirm(`确定删掉「${event.title}」这笔吗？`)) {
      removeEvent(event.id);
      onChanged();
    }
  });

  // 改期内联表单
  const changeMsg = createElement('div', 'msg-box');
  changeMsg.style.display = 'none';
  const changeRow = createElement('div', 'form-row');
  const newDateInput = document.createElement('input');
  newDateInput.type = 'date';
  newDateInput.value = event.date;
  const reasonInput = document.createElement('input');
  reasonInput.type = 'text';
  reasonInput.placeholder = '改期原因（如：酒店没档期）';
  const confirmBtn = createElement('button', 'small-btn', '确定改');
  changeRow.append(newDateInput, reasonInput, confirmBtn);

  confirmBtn.addEventListener('click', () => {
    const result = changeEventDate(event.id, newDateInput.value, reasonInput.value);
    if (result.ok) {
      onChanged();
    } else {
      showMsg(changeMsg, 'error', result.errors);
    }
  });

  changeForm.append(changeMsg, changeRow);
  card.append(actions, changeForm);

  return card;
}

// ==================== 工具 ====================

function showMsg(box: HTMLElement, type: 'success' | 'error', messages: string[]) {
  box.className = `msg-box ${type === 'success' ? 'success-box' : 'error-box'}`;
  box.innerHTML = messages.map(m => `<div>${m}</div>`).join('');
  box.style.display = 'block';
}
