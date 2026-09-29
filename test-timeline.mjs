import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-timeline-'));
const require = createRequire(import.meta.url);
const windowOf = (start, end = start) => ({ plannedStartDate: start, plannedEndDate: end });
let checks = 0;
const check = (name, run) => { run(); checks++; process.stdout.write(`PASS ${name}\n`); };
try {
  const source = await readFile(resolve(root, 'src/components/timelineScale.ts'), 'utf8');
  await writeFile(resolve(outputDir, 'timelineScale.mjs'), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText);
  const { buildTimelineScale, calendarDay, dayLabel } = await import(pathToFileURL(resolve(outputDir, 'timelineScale.mjs')).href);
  check('invalid/missing dates are not silently plotted as real schedules', () => {
    for (const value of ['', undefined, '2026-02-30', 'invalid']) assert.equal(calendarDay(value), null);
    const scale = buildTimelineScale([], '2026-09-29', 72);
    assert.equal(scale.range(windowOf('')), null);
    assert.equal(scale.range(windowOf('2026-10-02', '2026-10-01')), null);
    assert.ok(scale.width > 0);
  });
  check('long schedules grow the canvas, never shrink week columns', () => {
    const scale = buildTimelineScale([windowOf('2026-09-28', '2027-06-30')], '2026-09-29', 72);
    assert.ok(scale.width > 2800);
    for (let i = 1; i < scale.weeks.length; i++) assert.ok(Math.abs(scale.weeks[i].left - scale.weeks[i - 1].left - 72) < 0.001);
    assert.ok(Math.abs(scale.months.reduce((sum, month) => sum + month.width, 0) - scale.width) < 0.001);
  });
  check('single-day and week-long bars keep true inclusive duration', () => {
    const scale = buildTimelineScale([windowOf('2026-09-28', '2027-06-30')], '2026-09-29', 72);
    assert.equal(scale.range(windowOf('2026-09-29')).width, 72 / 7);
    assert.equal(scale.range(windowOf('2026-09-28', '2026-10-04')).width, 72);
    assert.equal(scale.todayLeft, scale.range(windowOf('2026-09-29')).left + scale.dayWidth / 2);
  });
  check('ISO week-year boundary has W53 then W01 with full-date tooltips', () => {
    const scale = buildTimelineScale([windowOf('2026-12-28', '2027-01-10')], '2027-01-01', 72);
    assert.equal(scale.weeks.find(week => week.date === '2026-12-28').title, '2026 W53 · 2026-12-28 至 2027-01-03');
    assert.equal(scale.weeks.find(week => week.date === '2027-01-04').label, 'W01');
  });
  check('date-only geometry is unchanged across DST timezones', () => {
    const prior = process.env.TZ;
    try {
      for (const zone of ['Asia/Shanghai', 'America/New_York', 'Europe/Berlin']) {
        process.env.TZ = zone;
        const scale = buildTimelineScale([windowOf('2026-03-07', '2026-03-10')], '2026-03-08', 72);
        assert.equal(scale.range(windowOf('2026-03-07', '2026-03-10')).width, 4 * 72 / 7);
      }
    } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  });
  check('zoom preserves time ratios and enforces minimum readable width', () => {
    const ranges = [windowOf('2026-09-28', '2026-10-10')];
    const small = buildTimelineScale(ranges, '2026-09-29', 20);
    const large = buildTimelineScale(ranges, '2026-09-29', 112);
    assert.equal(small.dayWidth, 8);
    assert.equal(large.width, small.width * 2);
    assert.equal(large.range(ranges[0]).width, small.range(ranges[0]).width * 2);
  });
  check('outside-today, overflow clipping and phase-external items', () => {
    const scale = buildTimelineScale([windowOf('2026-09-28'), windowOf('2027-03-10')], '2025-01-01', 72);
    assert.equal(scale.todayLeft, null);
    assert.ok(scale.range(windowOf('2027-03-10')));
    const clipped = scale.range(windowOf(dayLabel(scale.start - 5), dayLabel(scale.end + 5)));
    assert.deepEqual(clipped, { left: 0, width: scale.width });
  });

  let component = ts.transpileModule(await readFile(resolve(root, 'src/components/TimelineGantt.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  component = component.replace("'./timelineScale'", "'./timelineScale.mjs'").replace('"./timelineScale"', '"./timelineScale.mjs"')
    .replace(/import ['"]\.\/TimelineGantt\.css['"];?/, '');
  for (const name of ['react/jsx-runtime', 'react', 'lucide-react']) {
    component = component.replaceAll(`from "${name}"`, `from "${pathToFileURL(require.resolve(name)).href}"`)
      .replaceAll(`from '${name}'`, `from '${pathToFileURL(require.resolve(name)).href}'`);
  }
  await writeFile(resolve(outputDir, 'TimelineGantt.mjs'), component);
  const { default: TimelineGantt } = await import(pathToFileURL(resolve(outputDir, 'TimelineGantt.mjs')).href);
  const longName = '电气模块自动化生产线机器人安全联锁及虚拟仿真联合验收完整名称';
  const items = Array.from({ length: 15 }, (_, index) => ({ ...windowOf('2026-09-29'), id: `item-${index}`, title: `${longName}-${index}`, moduleName: '电气', ownerLabel: '未设置负责人', statusLabel: '待处理', barClass: 'bg-warning' }));
  const props = { project: null, phases: [{ ...windowOf('2026-09-28', '2027-06-30'), id: 'phase-1', name: '设计会签', status: '未开始', progressPercent: 0, completed: 0, items }], today: '2026-09-29', selectedId: 'item-0', onSelect() {} };
  check('all task names render independently, including more than twelve items', () => {
    const html = renderToStaticMarkup(React.createElement(TimelineGantt, props));
    assert.equal((html.match(/class="time-gantt-item-name"/g) || []).length, 15);
    assert.ok(html.includes(`${longName}-14</button>`));
    assert.ok(!html.includes('truncate'));
    assert.equal((html.match(/class="time-gantt-today-label"/g) || []).length, 1);
    assert.equal((html.match(/class="time-gantt-today-line"/g) || []).length, 1);
    assert.ok(html.includes('aria-controls="timeline-selected-detail"'));
    assert.ok(html.includes('aria-expanded="true"'));
  });
  check('empty phase and invalid schedule are explicit, no invented bars', () => {
    const html = renderToStaticMarkup(React.createElement(TimelineGantt, { ...props, phases: [{ ...props.phases[0], plannedStartDate: '', plannedEndDate: '', items: [] }] }));
    assert.ok(html.includes('当前筛选下该阶段暂无检查项'));
    assert.ok(html.includes('未设置有效计划日期'));
  });
  process.stdout.write(`${checks} timeline checks passed\n`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
