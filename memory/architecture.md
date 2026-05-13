# li-bs-auto-status 前端架构记录

## 2026-05-13 Dashboard 收口

- 默认入口为 `dashboard`，首屏承载项目选择、总完成率、导出入口、层级筛选、阶段轨道、检查模块泳道、检查项详情、重点问题表、碰撞一页纸、签核状态和附件入口。
- 数据接入优先走 `/api/li-bs-auto-status/v1/dashboard/` 聚合接口，项目列表与 dashboard 查询统一透传 `project`、`factory`、`workshop`、`production_line`、`status` 筛选参数。
- 项目创建遵循后端最终口径：`factory` / `workshop` 必选，`production_line` 可选；产线为空表示车间级项目。
- 基础数据级联读取 `/api/v1/base/factories/`、`/api/v1/base/workshops/`、`/api/v1/base/lines/`，后端不可用时用项目快照兜底，避免界面空白。
- 原型体验数据由真实后端 seed 提供，覆盖六阶段、7 模块、检查项标签、重点问题字段和碰撞一页纸字段；后端 seed 数据源收口为 `prototype_seed.py`，由 `seed_bs_auto_status_dev` 管理命令复用。KeyIssue 原型重点问题表字段在后端已是正式列，前端类型直接兼容这些字段。
- 导出任务列表只展示状态、文件名、文件大小、内容类型和时间等安全元信息；下载统一通过管理员动作 `/api/li-bs-auto-status/v1/export-jobs/{id}/download-link/` 获取短链，禁止直接把 `content_url`、bucket/object key 或本地产物地址渲染为链接。
- 负责人候选接口保持 `/api/li-bs-auto-status/v1/idaas-candidates/`，前端 adapter 接受 snake_case 候选字段和候选数组包装；候选不可用时回退为空列表，负责人字段仍可手工输入。

## 2026-05-13 基础配置与时间甘特

- 新增 `baseConfig` SPA 入口，集中维护项目基础信息、项目六阶段实例和阶段下检查项；只读账号保留页面可见性，所有写控件禁用，403 仅作为无权限提示处理。
- 项目基础信息维护字段覆盖工厂、车间、可选产线、项目名称、编号、状态、负责人、计划时间范围和说明；更新接口 adapter 走 `PATCH /projects/{id}/`，同时发送后端已有字段与 `metadata` 兼容字段。
- 阶段配置保持六阶段稳定 `code` key，可按项目编辑阶段名称、计划开始/结束、目标、排序、状态和启用状态；更新接口 adapter 走 `PATCH /project-phases/{id}/`。
- 检查项配置保留默认 7 模块 / 37 项体验，可编辑名称、模块、标签、计划开始/结束、负责人、状态和启用状态；更新接口 adapter 走 `PATCH /check-items/{id}/`，兼容 `tags`、`metadata.tags`、`planned_start_date`、`planned_end_date`。
- `timeline` 视图升级为时间甘特：阶段窗口和检查项条按计划日期计算横向位置/宽度，显示当前日期线，并区分完成、进行中、阻塞和逾期。
- Dashboard 新增项目统计列表和单项目统计区；优先消费 `/dashboard/` 返回的 `project_statistics` / `project_stats`，后端未提供时用当前项目 bundle 和项目列表做前端兜底。

## 2026-05-13 最终 API 契约收口

- 项目基础配置沿最终 `/projects/` 契约：`factory` / `workshop` 必选，`production_line` 可空表示车间级项目；项目更新走 `PATCH /projects/{id}/`。
- 新建项目未传 `phase_template` 时后端默认使用 `bs-auto-status-six-phase`；配置中心“补齐默认六阶段”入口调用 `POST /projects/{id}/seed-template/`。
- 阶段和检查项启停/排序/时间字段收口为 `is_enabled`、`planned_start`、`planned_end`，阶段走 `/project-phases/{id}/`，检查项走 `/check-items/{id}/`，并在基础配置页提供 DELETE 操作。
- Dashboard 聚合继续读取 `/dashboard/`，新增逾期字段 `overdue_count` 和项目摘要 `project_summaries`；项目统计列表优先读取 `/dashboard/projects/`。
- 单项目统计优先读取 `/dashboard/projects/{project_id}/`，并接收其中的 `timeline`；时间甘特优先读取 `/projects/{id}/timeline/`，缺省时回退项目阶段/检查项 bundle。
- 最终 API 路由：`/dashboard/projects/`、`/dashboard/projects/:projectId/`、`/projects/:projectId/timeline/`、`/projects/:projectId/seed-template/`、阶段/检查项 PATCH/DELETE。

## 2026-05-13 真实后端数据收口

- 前端运行时完全依赖真实后端 API 与 seed 原型数据，不再注册浏览器请求拦截器，也不保留本地填充数据文件。
- MSW、`mocks/`、`mockServiceWorker.js`、`VITE_ENABLE_MOCKS` 与本地填充数据已删除；dev、build、type-check 逻辑不再包含本地数据兜底，后端无数据时页面展示空态。
- Dashboard 项目统计兼容 `planned_start` / `planned_end`、`overdue_phase_count` / `overdue_check_item_count`；未返回总逾期数时前端以阶段逾期 + 检查项逾期计算。
- 默认六阶段和默认检查项不展示删除入口，基础配置页以 `is_enabled=false` 作为停用路径；删除入口仅在后端显式返回 `can_delete=true` 时出现。
- 导出任务下载按钮只以 `has_result=true` 判断是否可下载，不再用对象键推断权限或产物可用性。

## 2026-05-13 配置中心与筛选收口

- 导航入口收敛为 `配置中心`，不再在侧边栏拆分“项目列表 / 基础配置 / 阶段配置 / 配置管理”；配置中心同页承载范围选择、项目列表、项目基础信息、六阶段、阶段检查项、检查模块、检查项模板和负责人候选。
- 配置中心项目新增继续走真实 `/projects/`，检查项新增走真实 `/projects/{id}/check-items/`；阶段编辑/启停走 `/project-phases/{id}/`，检查项编辑/启停/自定义删除走 `/check-items/{id}/`。
- 配置中心提供“补齐默认六阶段”入口，复用真实 `/projects/{id}/seed-template/`。
- 筛选搜索统一作用于真实后端返回或当前页已加载数据：Dashboard 项目统计、Dashboard 模块泳道/检查项详情、配置中心项目/阶段/检查项、时间甘特、检查项表、重点问题、碰撞一页纸和导出任务均有稳定筛选栏。
- 只读用户仍可进入所有页面查看真实数据；所有写按钮和表单输入按 `canWrite` 禁用，并在页面内呈现只读/403 反馈。

## 2026-05-13 审查返修收口

- 阶段和检查项删除入口继续只在 `can_delete/canDelete === true` 时展示；默认项、未明确可删项只允许启停，不展示硬删除。
- Dashboard 底部“生成总览导出”按 `canWrite` 禁用，并为只读用户显示无权限内联反馈，避免点击后静默无动作。
- 配置中心检查项筛选支持“全部阶段”，清空阶段后展示当前项目全部检查项；新增检查项仍要求选择具体阶段。
- 项目、阶段、检查项 PATCH 均携带当前对象 `metadata` 并合并本表单负责字段，避免整体覆盖后端已有扩展键。

## 2026-05-13 Dashboard 列表详情与动态阶段数

- Dashboard 首页新增项目状态总览，先展示全部项目数量、整体完成率、逾期、重点问题和碰撞签核，再进入项目统计列表。
- Dashboard 首页采用“列表在上、详情在下”的项目下钻口径：上方保持横向项目统计表，点击项目行或操作按钮后保留选中态，并在列表下方自然渲染所选项目详情区。
- 项目筛选归入项目统计列表栏，作为 `ProjectStatisticsList` panel 内 header 与横向表格之间的筛选区；Dashboard 顶层不再单独渲染项目筛选 panel。
- Project Context、单项目统计、阶段轨、范围统计、详情筛选、模块泳道、检查项详情、重点问题、碰撞一页纸和导出入口统一由列表下方的 `ProjectDashboardExpansion` 承载；项目统计表不再插入选中行后的详情 `<tr>`。
- `ProjectDashboardExpansion` 内检查详情区统一为“上方筛选/矩阵选择，下方自然展示详情”：`DashboardDetailFilters -> ModuleSwimlane -> ChecklistDetailPanel` 顺序堆叠，不再使用侧边详情列。
- Dashboard 重点问题表同样采用“表格选择在上、问题详情在下”的连续布局；`KeyIssueTable` 内部维护选中问题，默认选择第一条，行点击、详情按钮和 Enter/Space 键盘选择都会更新下方详情，且不再插入表格行内展开内容。
- 检查模块泳道横轴阶段列展示阶段名称、计划开始/结束日期和阶段进度，避免只看到阶段名无法判断排期。
- 非配置页的阶段来源统一过滤 `isActive !== false`：Dashboard 阶段轨、泳道、检查项表和时间甘特只展示启用阶段；配置中心仍展示全部阶段用于停用/恢复。
- 配置中心检查项维护补齐已有项阶段切换；新增检查项不再被空日期提前禁用，未显式填计划日期时由后端按所属阶段计划继承。

## 2026-05-13 配置中心表格下钻收口

- 配置中心项目列表改为横向表格选行，点击项目行后在同页维护项目基础信息、阶段和检查项，保持与现有车间配置类页面一致的表格操作密度。
- 项目阶段配置从卡片改为“阶段表格 + 所选阶段维护区”：阶段表保留序号、阶段、Key、计划窗口、状态、启用、检查项数量和完成数；点击阶段行后，下方展示该阶段编辑、启停、删除和检查项配置。
- 阶段检查项区绑定所选阶段，只展示该阶段的检查项，同时保留每条检查项的阶段下拉迁移能力和新增检查项能力。
- 对停用或被裁剪阶段，配置中心仍展示阶段本体和历史检查项，并新增“迁移本阶段检查项”批量动作，可把该阶段检查配置迁移到其它阶段，支持 5 阶段/6 阶段项目差异。
- 从 Dashboard 或项目列表创建项目后默认进入 `baseConfig`，让新项目在创建后立即完成阶段和检查项确认；左侧导航将配置中心移动到目录末尾，避免基础配置入口压过业务执行入口。
- 检查项台账页新增同源创建表单，直接调用 `/projects/{id}/check-items/`；配置中心仍作为阶段级批量配置入口，检查项页负责日常新增、筛选和负责人维护。
