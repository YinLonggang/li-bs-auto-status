import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, ChevronRight, LocateFixed, Minus, Plus } from 'lucide-react';
import { buildTimelineScale } from './timelineScale';
import type { TimelineWindow } from './timelineScale';
import './TimelineGantt.css';

export type TimelineItemRow = TimelineWindow & {
  id: string;
  title: string;
  moduleName: string;
  ownerLabel: string;
  statusLabel: string;
  barClass: string;
};

export type TimelinePhaseRow = TimelineWindow & {
  id: string;
  name: string;
  status: ReactNode;
  progressPercent: number;
  completed: number;
  items: TimelineItemRow[];
};

const WEEK_WIDTHS = [56, 72, 96, 128];

export default function TimelineGantt({ project, phases, today, selectedId, onSelect }: {
  project: TimelineWindow | null;
  phases: TimelinePhaseRow[];
  today: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const viewport = useRef<HTMLDivElement>(null);
  const infoHeader = useRef<HTMLDivElement>(null);
  const pendingCenter = useRef<number | null>(null);
  const scale = buildTimelineScale([
    ...(project ? [project] : []),
    ...phases.flatMap(phase => [phase, ...phase.items])
  ], today, WEEK_WIDTHS[zoom]);

  useEffect(() => {
    if (pendingCenter.current === null || !viewport.current) return;
    const visibleWidth = viewport.current.clientWidth - (infoHeader.current?.offsetWidth ?? 360);
    viewport.current.scrollLeft = pendingCenter.current * scale.dayWidth - visibleWidth / 2;
    pendingCenter.current = null;
  }, [scale.dayWidth]);

  const changeZoom = (next: number) => {
    if (viewport.current) {
      const visibleWidth = viewport.current.clientWidth - (infoHeader.current?.offsetWidth ?? 360);
      pendingCenter.current = (viewport.current.scrollLeft + visibleWidth / 2) / scale.dayWidth;
    }
    setZoom(next);
  };
  const locateToday = () => {
    if (!viewport.current || scale.todayLeft === null) return;
    const visibleWidth = viewport.current.clientWidth - (infoHeader.current?.offsetWidth ?? 360);
    viewport.current.scrollLeft = Math.max(0, scale.todayLeft - visibleWidth / 2);
  };
  const togglePhase = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const windowLabel = (window: TimelineWindow) => `${window.plannedStartDate || '未设置'} 至 ${window.plannedEndDate || '未设置'}`;

  return (
    <div className="mt-5" data-testid="timeline-gantt">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted" id="timeline-help">左侧查看完整名称，右侧横向滚动查看排期；点击名称或时间条联动下方详情。</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn--sm" type="button" onClick={() => setCollapsed(new Set())}>全部展开</button>
          <button className="btn btn-ghost btn--sm" type="button" onClick={() => setCollapsed(new Set(phases.map(phase => phase.id)))}>全部收起</button>
          <div className="flex items-center gap-2" role="group" aria-label="时间轴缩放">
            <button className="btn btn-ghost btn--sm" type="button" aria-label="缩小时间轴" disabled={zoom === 0} onClick={() => changeZoom(zoom - 1)}><Minus className="h-4 w-4" /></button>
            <span className="min-w-20 text-center text-xs text-ink-muted" aria-live="polite">{WEEK_WIDTHS[zoom]}px / 周</span>
            <button className="btn btn-ghost btn--sm" type="button" aria-label="放大时间轴" disabled={zoom === WEEK_WIDTHS.length - 1} onClick={() => changeZoom(zoom + 1)}><Plus className="h-4 w-4" /></button>
          </div>
          <button className="btn btn-secondary btn--sm" type="button" disabled={scale.todayLeft === null} title={scale.todayLeft === null ? '今天不在当前项目时间范围内' : today} onClick={locateToday}><LocateFixed className="h-4 w-4" />定位今天</button>
        </div>
      </div>
      <div className="time-gantt-viewport" ref={viewport} tabIndex={0} role="region" aria-label="项目阶段时间甘特" aria-describedby="timeline-help">
        <div className="time-gantt-canvas" style={{ '--timeline-width': `${scale.width}px`, '--week-width': `${scale.dayWidth * 7}px` } as CSSProperties}>
          <div className="time-gantt-row time-gantt-header">
            <div className="time-gantt-info time-gantt-corner" ref={infoHeader}>
              <span className="font-semibold">阶段 / 检查项</span>
              <span className="mt-1 text-xs text-ink-muted">模块 · 状态 · 负责人 · 计划日期</span>
            </div>
            <div className="time-gantt-scale">
              {scale.months.map(month => <div className={`time-gantt-month${month.width < 100 ? ' time-gantt-month--short' : ''}`} key={`${month.label}-${month.left}`} style={{ left: month.left, width: month.width }} title="按 ISO 周的周四归属月份">{month.width < 100 ? month.label.replace('年', '年\n') : month.label}</div>)}
              {scale.weeks.map(week => <div className="time-gantt-week" key={week.date} style={{ left: week.left, width: scale.dayWidth * 7 }} title={week.title}>{week.label}</div>)}
              {scale.todayLeft !== null ? <span className="time-gantt-today-label" style={{ left: scale.todayLeft }} title={today}>今天</span> : null}
            </div>
          </div>
          <div className="time-gantt-body">
            {scale.todayLeft !== null ? <div className="time-gantt-today-line" style={{ left: `calc(var(--info-width) + ${scale.todayLeft}px)` }} aria-hidden="true" /> : null}
            {phases.map(phase => {
              const closed = collapsed.has(phase.id);
              const phaseRange = scale.range(phase);
              return (
                <div key={phase.id}>
                  <div className="time-gantt-row time-gantt-phase" data-phase-id={phase.id}>
                    <div className="time-gantt-info">
                      <button className="time-gantt-phase-toggle" type="button" aria-expanded={!closed} aria-controls={`timeline-phase-${phase.id}`} onClick={() => togglePhase(phase.id)}>
                        {closed ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span className="min-w-0 break-words font-semibold">{phase.name}</span>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">{phase.status}<span>{phase.completed}/{phase.items.length} 项完成</span></div>
                      <div className="mt-1 text-xs text-ink-muted">{windowLabel(phase)}</div>
                    </div>
                    <div className="time-gantt-track">
                      {phaseRange ? <div className="time-gantt-phase-bar" style={phaseRange} title={`${phase.name} · ${windowLabel(phase)} · ${phase.progressPercent}%`}>
                        <div className="h-full bg-primary/50" style={{ width: `${Math.max(0, Math.min(100, phase.progressPercent))}%` }} />
                      </div> : <span className="time-gantt-no-date">未设置有效计划日期</span>}
                    </div>
                  </div>
                  <div id={`timeline-phase-${phase.id}`} hidden={closed}>
                    {phase.items.map(item => {
                      const selected = item.id === selectedId;
                      const range = scale.range(item);
                      const description = `${item.title} · ${item.moduleName} · ${item.statusLabel} · ${windowLabel(item)} · ${item.ownerLabel}`;
                      return (
                        <div className={`time-gantt-row time-gantt-item${selected ? ' is-selected' : ''}`} key={item.id} data-item-id={item.id}>
                          <div className="time-gantt-info">
                            <button className="time-gantt-item-name" type="button" onClick={() => onSelect(item.id)} aria-pressed={selected} aria-controls="timeline-selected-detail">{item.title}</button>
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-muted"><span>{item.moduleName}</span><span className="font-semibold">{item.statusLabel}</span></div>
                            <div className="mt-1 break-words text-xs text-ink-muted">{item.ownerLabel}</div>
                            <div className="mt-1 text-xs text-ink-muted">{windowLabel(item)}</div>
                          </div>
                          <div className="time-gantt-track">
                            {range ? <button className={`time-gantt-item-bar ${item.barClass}`} style={range} type="button" title={description} aria-label={`选择检查项 ${description}`} aria-pressed={selected} aria-controls="timeline-selected-detail" onClick={() => onSelect(item.id)} /> : <span className="time-gantt-no-date">未设置有效计划日期</span>}
                          </div>
                        </div>
                      );
                    })}
                    {!phase.items.length ? <div className="time-gantt-row"><div className="time-gantt-info text-xs text-ink-muted">当前筛选下该阶段暂无检查项。</div><div className="time-gantt-track" /></div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
