#!/usr/bin/env node
// Builds docs/plans-status.html from plans/*.md: every plan, finished or not, with its
// status, goal, progress and open tasks. Self-contained output (no external resources, §1).
// Usage: node tools/plans-status.mjs   (no dependencies; rerun after any plan changes)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plansDir = join(root, 'plans');
const out = join(root, 'docs', 'plans-status.html');

const esc = (s) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal inline markdown: code, bold, italic, links. Input is escaped first. */
function inline(s) {
	const codes = [];
	let h = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
	h = h
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
			const href = /^[\w.-]+\.md(#.*)?$/.test(u) ? `../plans/${u}` : u;
			return `<a href="${href}">${t}</a>`;
		});
	return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

function kindOf(status) {
	const s = status.toLowerCase();
	if (/urgent/.test(s)) return 'urgent';
	if (/^superseded/.test(s)) return 'superseded';
	if (/^done/.test(s)) return 'done';
	if (/^on hold/.test(s)) return 'hold';
	if (/^to do/.test(s)) return 'todo';
	return 'progress';
}

function parsePlan(file) {
	const lines = readFileSync(join(plansDir, file), 'utf8').split('\n');
	const plan = { file, title: '', status: '', date: '', goal: '', tasks: [] };
	let section = '';
	let sub = '';
	let field = null;
	let task = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!plan.title && /^# /.test(line)) {
			plan.title = line.slice(2).trim();
			continue;
		}
		const hdr = line.match(/^\*\*(Status|Date|Goal|Priority):\*\*\s*(.*)$/);
		if (hdr && !plan.tasks.length) {
			field = hdr[1].toLowerCase();
			plan[field] = hdr[2].trim();
			continue;
		}
		if (field) {
			if (line.trim() === '' || /^(#|\*\*\w+:\*\*)/.test(line)) field = null;
			else {
				plan[field] += ' ' + line.trim();
				continue;
			}
		}
		const h = line.match(/^(#{2,4})\s+(.*)$/);
		if (h) {
			task = null;
			if (h[1] === '##') {
				section = h[2].trim();
				sub = '';
			} else sub = h[2].trim();
			continue;
		}
		const t = line.match(/^(\s*)- \[([ xX])\]\s+(.*)$/);
		if (t) {
			task = {
				indent: t[1].length,
				done: t[2] !== ' ',
				text: t[3].trim(),
				notes: [],
				group: sub ? `${section} › ${sub}` : section,
				textOpen: true
			};
			plan.tasks.push(task);
			continue;
		}
		if (!task) continue;
		const indent = line.match(/^(\s*)/)[1].length;
		const trimmed = line.trim();
		if (trimmed === '') {
			task.textOpen = false;
			continue;
		}
		if (indent <= task.indent && !trimmed.startsWith('>')) {
			task = null;
			continue;
		}
		if (trimmed.startsWith('>')) {
			task.textOpen = false;
			const n = trimmed.replace(/^>\s?/, '').replace(/^note:\s*/i, '');
			if (/^>\s?note:/i.test(trimmed) || !task.notes.length) task.notes.push(n);
			else task.notes[task.notes.length - 1] += ' ' + n;
			continue;
		}
		if (task.textOpen) task.text += (/^- /.test(trimmed) ? '\n' : ' ') + trimmed;
	}
	plan.kind = kindOf(plan.status);
	plan.doneCount = plan.tasks.filter((x) => x.done).length;
	return plan;
}

const isUserCheck = (t) =>
	/manual check|by the user|user reports|the user's (ok|check)|user runs/i.test(t.text);

const plans = readdirSync(plansDir)
	.filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f))
	.sort()
	.map(parsePlan);

const KIND = {
	urgent: { label: 'Urgent', cls: 'k-urgent' },
	progress: { label: 'In progress', cls: 'k-progress' },
	todo: { label: 'To do', cls: 'k-todo' },
	hold: { label: 'On hold', cls: 'k-hold' },
	done: { label: 'Done', cls: 'k-done' },
	superseded: { label: 'Superseded', cls: 'k-super' }
};
const ORDER = ['urgent', 'progress', 'todo', 'hold'];

const finished = plans.filter((p) => p.kind === 'done' || p.kind === 'superseded');
const unfinished = plans
	.filter((p) => !finished.includes(p))
	.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.file.localeCompare(b.file));
const allTasks = plans.flatMap((p) => p.tasks);
const totalDone = allTasks.filter((t) => t.done).length;
const openTasks = allTasks.length - totalDone;
const userChecks = unfinished.flatMap((p) => p.tasks.filter((t) => !t.done && isUserCheck(t)));

function taskHtml(t, plan) {
	const [first, ...rest] = t.text.split('\n');
	const bullets = rest.length
		? `<ul class="sub">${rest.map((r) => `<li>${inline(r.replace(/^- /, ''))}</li>`).join('')}</ul>`
		: '';
	const notes = t.notes.length
		? `<div class="notes">${t.notes.map((n) => `<p>${inline(n)}</p>`).join('')}</div>`
		: '';
	const flag = !t.done && isUserCheck(t) ? '<span class="pill k-user">your check</span> ' : '';
	return `<li class="task ${t.done ? 'is-done' : 'is-open'}${t.indent ? ' nested' : ''}" data-user="${!t.done && isUserCheck(t)}">
<span class="box" aria-hidden="true">${t.done ? '✓' : ''}</span>
<div><div class="tt">${flag}${inline(first)}</div>${bullets}${notes}</div></li>`;
}

function groupedTasks(tasks, plan) {
	const groups = new Map();
	for (const t of tasks) {
		if (!groups.has(t.group)) groups.set(t.group, []);
		groups.get(t.group).push(t);
	}
	return [...groups]
		.map(
			([g, ts]) =>
				`${g ? `<h4>${inline(g)}</h4>` : ''}<ul class="tasks">${ts.map((t) => taskHtml(t, plan)).join('')}</ul>`
		)
		.join('');
}

function planCard(p) {
	const total = p.tasks.length;
	const pct = total ? Math.round((p.doneCount / total) * 100) : 0;
	const open = p.tasks.filter((t) => !t.done);
	const done = p.tasks.filter((t) => t.done);
	const k = KIND[p.kind];
	const search = `${p.title} ${p.status} ${p.goal} ${p.tasks.map((t) => t.text).join(' ')}`.toLowerCase();
	return `<article class="plan ${k.cls}" id="${esc(p.file.replace(/\.md$/, ''))}" data-kind="${p.kind}" data-search="${esc(search)}">
<header>
  <span class="pill ${k.cls}">${k.label}</span>
  <span class="date">${esc(p.date)}</span>
  <a class="file" href="../plans/${esc(p.file)}"><code>plans/${esc(p.file)}</code></a>
</header>
<h3>${inline(p.title)}</h3>
<p class="status"><strong>Status:</strong> ${inline(p.status)}</p>
${p.goal ? `<details class="goal"><summary>Goal</summary><p>${inline(p.goal)}</p></details>` : ''}
<div class="progress" role="img" aria-label="${p.doneCount} of ${total} tasks done">
  <div class="bar"><span style="width:${pct}%"></span></div>
  <span class="count"><strong>${p.doneCount}</strong> / ${total} tasks · ${pct}%</span>
</div>
${open.length ? `<section class="open"><h4 class="lead">Open tasks (${open.length})</h4>${groupedTasks(open, p)}</section>` : ''}
${done.length ? `<details class="donelist"><summary>Finished tasks (${done.length})</summary>${groupedTasks(done, p)}</details>` : ''}
</article>`;
}

const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, plans.filter((p) => p.kind === k).length]));
const generated = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plans Status</title>
<!--
  GENERATED by tools/plans-status.mjs from plans/*.md. Do not edit by hand: change the plans,
  then run \`node tools/plans-status.mjs\`. Self-contained: no external fonts, scripts or CDNs
  (CLAUDE.md §1). No personal data: the plans hold IDs and counts only.
-->
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --ink: #1d2433; --muted: #5b6577; --line: #d9dee7;
    --app: #1f6f8b; --app-soft: #e3f1f6;
    --ok: #2e7d4f; --ok-soft: #e4f3ea; --warn: #b5651d; --warn-soft: #fbefe3;
    --bad: #b3261e; --bad-soft: #fbe7e5; --plum: #714b67; --plum-soft: #f1e9ef;
    --track: #e7ebf1;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #12151b; --card: #1b2029; --ink: #e8ecf3; --muted: #a3adbf; --line: #323a48;
      --app: #6cc3df; --app-soft: #16303a;
      --ok: #6fcf97; --ok-soft: #173326; --warn: #f0a868; --warn-soft: #3a2a19;
      --bad: #f2867e; --bad-soft: #3b1c1a; --plum: #c99bbd; --plum-soft: #2c2230;
      --track: #2a313d;
    }
  }
  :root[data-theme="dark"] {
    --bg: #12151b; --card: #1b2029; --ink: #e8ecf3; --muted: #a3adbf; --line: #323a48;
    --app: #6cc3df; --app-soft: #16303a;
    --ok: #6fcf97; --ok-soft: #173326; --warn: #f0a868; --warn-soft: #3a2a19;
    --bad: #f2867e; --bad-soft: #3b1c1a; --plum: #c99bbd; --plum-soft: #2c2230;
    --track: #2a313d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  }
  main { max-width: 1080px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 6px 0 4px; }
  h2 { font-size: 21px; margin: 32px 0 6px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  h2 small { font-size: 14px; font-weight: 400; color: var(--muted); }
  h3 { font-size: 18px; line-height: 1.35; margin: 6px 0; }
  h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 14px 0 4px; }
  h4.lead { color: var(--ink); }
  p { margin: 6px 0; }
  a { color: var(--app); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .86em;
    background: var(--app-soft); padding: 0 4px; border-radius: 4px; overflow-wrap: anywhere; }
  .muted { color: var(--muted); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  .stat b { display: block; font-size: 26px; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 14px; color: var(--muted); }
  .tools { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 10px 0;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-bottom: 1px solid var(--line); }
  .tools input { flex: 1 1 220px; min-width: 0; padding: 8px 12px; border: 1px solid var(--line);
    border-radius: 10px; background: var(--card); color: var(--ink); font: inherit; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { border: 1px solid var(--line); background: var(--card); color: var(--ink);
    border-radius: 999px; padding: 4px 12px; font: inherit; font-size: 14px; cursor: pointer; }
  .chips button[aria-pressed="true"] { background: var(--app); color: #fff; border-color: var(--app); }
  .pill { display: inline-block; padding: 1px 10px; border-radius: 999px; font-size: 13px; white-space: nowrap; font-weight: 600; }
  .k-urgent { --k: var(--bad); --ks: var(--bad-soft); }
  .k-progress { --k: var(--app); --ks: var(--app-soft); }
  .k-todo { --k: var(--warn); --ks: var(--warn-soft); }
  .k-hold { --k: var(--plum); --ks: var(--plum-soft); }
  .k-done { --k: var(--ok); --ks: var(--ok-soft); }
  .k-super { --k: var(--muted); --ks: var(--track); }
  .k-user { --k: var(--warn); --ks: var(--warn-soft); font-size: 12px; }
  .pill { background: var(--ks); color: var(--k); }
  article.plan { background: var(--card); border: 1px solid var(--line); border-inline-start: 4px solid var(--k);
    border-radius: 14px; padding: 14px 18px; margin: 12px 0; }
  article.plan > header { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 14px; }
  article.plan .date { color: var(--muted); font-variant-numeric: tabular-nums; }
  article.plan .file { margin-inline-start: auto; }
  .status { font-size: 15px; color: var(--muted); }
  .status strong { color: var(--ink); }
  details > summary { cursor: pointer; color: var(--app); font-size: 14px; font-weight: 600; margin: 6px 0; }
  details.goal p { font-size: 15px; }
  .progress { display: flex; align-items: center; gap: 12px; margin: 10px 0 4px; flex-wrap: wrap; }
  .bar { flex: 1 1 200px; height: 8px; background: var(--track); border-radius: 999px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--k); border-radius: 999px; }
  .count { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }
  ul.tasks { list-style: none; padding: 0; margin: 0; }
  li.task { display: grid; grid-template-columns: 20px 1fr; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); font-size: 15px; }
  li.task:first-child { border-top: 0; }
  li.task.nested { margin-inline-start: 24px; }
  .box { width: 18px; height: 18px; margin-top: 3px; border: 2px solid var(--line); border-radius: 5px;
    display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  li.is-done .box { background: var(--ok); border-color: var(--ok); color: #fff; }
  li.is-open .box { border-color: var(--k, var(--app)); }
  li.is-done .tt { color: var(--muted); }
  ul.sub { margin: 4px 0; padding-inline-start: 18px; font-size: 14px; color: var(--muted); }
  .notes { margin-top: 4px; padding: 4px 10px; border-inline-start: 3px solid var(--line); font-size: 14px; color: var(--muted); }
  .notes p { margin: 2px 0; }
  .waiting { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 6px 18px 10px; }
  .waiting li.task { grid-template-columns: 20px 1fr; }
  .waiting .from { font-size: 13px; color: var(--muted); }
  .hidden { display: none !important; }
  .empty { color: var(--muted); font-style: italic; }
  @media (max-width: 600px) { article.plan .file { margin-inline-start: 0; } h1 { font-size: 23px; } }
</style>
</head>
<body>
<main>
  <p class="muted">Attendance App · generated ${generated} from <code>plans/*.md</code></p>
  <h1>Plans status: finished and unfinished</h1>
  <p class="muted">Every plan in <code>plans/</code>, with its status line, goal, progress and open
  tasks. Rebuild with <code>node tools/plans-status.mjs</code> after a plan changes.</p>

  <div class="stats">
    <div class="stat"><b>${plans.length}</b><span>plans</span></div>
    <div class="stat"><b>${finished.length}</b><span>finished</span></div>
    <div class="stat"><b>${unfinished.length}</b><span>unfinished (${counts.urgent} urgent, ${counts.progress} in progress, ${counts.todo} to do, ${counts.hold} on hold)</span></div>
    <div class="stat"><b>${totalDone} / ${allTasks.length}</b><span>tasks done (${Math.round((totalDone / allTasks.length) * 100)}%)</span></div>
    <div class="stat"><b>${openTasks}</b><span>open tasks</span></div>
    <div class="stat"><b>${userChecks.length}</b><span>open tasks waiting on your check or OK</span></div>
  </div>

  <div class="tools">
    <input type="search" id="q" placeholder="Search plans and tasks…" aria-label="Search plans and tasks">
    <div class="chips" role="group" aria-label="Show">
      <button type="button" data-f="all" aria-pressed="true">All</button>
      <button type="button" data-f="unfinished" aria-pressed="false">Unfinished</button>
      <button type="button" data-f="finished" aria-pressed="false">Finished</button>
      <button type="button" data-f="urgent" aria-pressed="false">Urgent</button>
    </div>
  </div>

  <section id="s-waiting">
    <h2>Waiting on you <small>open manual checks and OKs across unfinished plans</small></h2>
    <div class="waiting">
      ${
				unfinished
					.map((p) => {
						const ts = p.tasks.filter((t) => !t.done && isUserCheck(t));
						if (!ts.length) return '';
						return `<h4><a href="#${esc(p.file.replace(/\.md$/, ''))}">${inline(p.title)}</a></h4><ul class="tasks ${KIND[p.kind].cls}">${ts.map((t) => taskHtml(t, p)).join('')}</ul>`;
					})
					.join('') || '<p class="empty">Nothing waiting.</p>'
			}
    </div>
  </section>

  <section id="s-unfinished">
    <h2>Unfinished plans <small>${unfinished.length} · urgent first, then in progress, to do, on hold</small></h2>
    ${unfinished.map(planCard).join('\n')}
  </section>

  <section id="s-finished">
    <h2>Finished plans <small>${finished.length}</small></h2>
    ${finished.length ? finished.map(planCard).join('\n') : '<p class="empty">None yet.</p>'}
  </section>
  <p class="empty hidden" id="none">No plan matches.</p>
</main>
<script>
(() => {
  const q = document.getElementById('q');
  const buttons = [...document.querySelectorAll('.chips button')];
  const plans = [...document.querySelectorAll('article.plan')];
  let f = 'all';
  function apply() {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    for (const a of plans) {
      const k = a.dataset.kind;
      const fin = k === 'done' || k === 'superseded';
      const okF = f === 'all' || (f === 'finished' && fin) || (f === 'unfinished' && !fin) || (f === 'urgent' && k === 'urgent');
      const ok = okF && (!term || a.dataset.search.includes(term));
      a.classList.toggle('hidden', !ok);
      if (ok) shown++;
    }
    for (const id of ['s-unfinished', 's-finished']) {
      const s = document.getElementById(id);
      s.classList.toggle('hidden', !s.querySelector('article.plan:not(.hidden)') && !!s.querySelector('article.plan'));
    }
    document.getElementById('s-waiting').classList.toggle('hidden', f === 'finished' || !!term);
    document.getElementById('none').classList.toggle('hidden', shown > 0);
  }
  for (const b of buttons) b.addEventListener('click', () => {
    f = b.dataset.f;
    for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
    apply();
  });
  q.addEventListener('input', apply);
})();
</script>
</body>
</html>
`;

writeFileSync(out, html);
console.log(
	`docs/plans-status.html: ${plans.length} plans (${finished.length} finished, ${unfinished.length} unfinished), ${totalDone}/${allTasks.length} tasks done, ${userChecks.length} waiting on the user`
);
