# li-bs-auto-status 进度记录

## 2026-05-13

### 今日目标

- 对齐后端最终 dashboard 与项目层级 API 口径。
- 将默认首页升级为正式产品 dashboard，而不是原型或普通概览页。

### 完成事项

- 默认视图切换为 `dashboard`，新增 header 项目选择、总完成率、导出入口。
- 新增工厂 -> 车间 -> 可选产线筛选和按范围创建项目。
- 接入 `/dashboard/` 聚合接口，并保留分项接口用于项目详情、阶段、检查项、问题、一页纸和导出任务。
- UI 复现原型核心体验：阶段轨道、统计卡、检查模块泳道、详情面板、重点问题表、碰撞一页纸、签核状态、附件入口。
- KeyIssue、Attachment、ExportJob 已兼容 bucket/object key 字段。
- 审查修复：导出任务不再直接渲染 `content_url` /本地产物 URL，点击下载时调用 `/export-jobs/{id}/download-link/`，403 作为页面内无权限提示处理。
- 审查修复：`/idaas-candidates/` 负责人候选兼容 snake_case 后端返回与候选集合包装，仍保留负责人手工输入。
- 新增“基础配置”入口，支持维护项目工厂/车间/可选产线、名称、编号、状态、负责人、计划时间和说明。
- 新增项目阶段配置 UI，保留默认六阶段稳定 code key，可编辑阶段名称、计划、目标、排序、状态和启用状态。
- 新增阶段检查项配置 UI，保留默认 7 模块 / 37 项体验，可编辑名称、模块、标签、计划、负责人、状态和启用状态。
- 阶段进度页升级为时间甘特，按计划开始/结束计算阶段窗口和检查项条位置，显示当前日期线、逾期、完成、阻塞状态。
- Dashboard 新增项目统计列表和单项目统计区，项目列表卡片可进入单项目统计。
- service/types 新增项目统计与项目/阶段/检查项 PATCH adapter，兼容后端后续 dashboard 聚合字段。
- 按后端最终契约收口：项目统计列表改为优先 `/dashboard/projects/`，单项目统计改为优先 `/dashboard/projects/{project_id}/`，时间甘特改为优先 `/projects/{id}/timeline/`。
- `/dashboard/` adapter 兼容 `overdue_count` 与 `project_summaries`；阶段/检查项 PATCH 字段切为 `is_enabled`、`planned_start`、`planned_end`，并补齐 DELETE。
- 新建项目未传 `phase_template` 时默认使用后端 `bs-auto-status-six-phase`；配置中心新增“补齐默认六阶段”入口，调用 `POST /projects/{id}/seed-template/`。
- 最终 API 契约覆盖 dashboard 项目统计、单项目详情 timeline、项目 timeline、`seed-template` 补齐入口、阶段/检查项 PATCH/DELETE。
- 完全下线本地填充数据与浏览器请求拦截器，dev 验收只使用真实后端 API 数据；后端无数据时页面展示空态。
- 删除 MSW、`mocks/`、`mockServiceWorker.js`、`VITE_ENABLE_MOCKS`，mock 下线门禁扫描源码、public、env、package、node_modules 均为 0 命中。
- Dashboard 项目统计补齐 `planned_start` / `planned_end`、阶段逾期和检查项逾期字段兼容；逾期总数缺失时由两类逾期相加。
- 基础配置默认阶段/检查项删除入口下线，只有后端返回 `can_delete=true` 的自定义项才展示删除；默认项通过启用/停用维护。
- 导出任务下载按钮改为使用 `has_result` 判断，timeline 项目 ID 兼容顶层 `project_id` 与 `project.id`。
- 侧边栏配置入口收敛为“配置中心”，项目列表、项目基础信息、六阶段、阶段检查项、模块/模板和负责人候选在同一工作台完成。
- 配置中心补齐检查项新增路径，调用真实 `/projects/{id}/check-items/`，并保持编辑、停用和自定义项删除路径。
- Dashboard 项目统计、Dashboard 模块泳道/检查项详情、配置中心项目/阶段/检查项、时间甘特、检查项表、重点问题、碰撞一页纸、报告定义和导出任务均补齐稳定筛选/搜索。
- 删除空 `li-bs-auto-status/mocks` 目录，运行期仍无 MSW、mock worker 或本地填充数据入口。

### 验证

- `npm run type-check` 通过；清理未使用旧首页计算后重新执行仍通过。
- `npm run build` 通过；清理未使用旧首页计算后重新执行仍通过。
- 3005 已有服务监听且 `GET http://127.0.0.1:3005/` 返回 200；本轮另起 Vite `3006`，`GET http://127.0.0.1:3006/` 返回 200。
- `git -C li-bs-auto-status diff --check` 通过。
- 3005 真实后端 DOM smoke 通过，38 个 `/api/...` 请求，`mock_resources: []`。
- `npm run permission-regression` 通过，失败数 0；当前缺少只读/可写 cookie，三态场景按脚本规则 SKIP。
- `GET http://127.0.0.1:3005/` 返回 HTTP 200。
- 本轮收口重新执行 `npm run type-check`、`npm run build`、`git -C li-bs-auto-status diff --check`、根仓 `git diff --check -- li-bs-auto-status` 均通过。
- mock 残留扫描通过：排除 `node_modules`、`dist`、`memory` 和 lockfile 后，源码/配置无 `MSW`、`setupWorker`、`mockServiceWorker`、`VITE_ENABLE_MOCKS`、`mocks/` 命中；`find` 未发现运行期 mock 文件或目录。
- 审查返修：删除入口保持显式 `can_delete/canDelete === true` 才展示；Dashboard 底部导出对只读用户禁用并显示无权限反馈；配置中心检查项阶段筛选新增“全部阶段”；项目/阶段/检查项 PATCH 改为合并当前对象 `metadata` 后再覆盖表单负责字段。
- 审查返修后重新执行 `npm run type-check`、`npm run build`、`git -C li-bs-auto-status diff --check`、根仓 `git diff --check -- li-bs-auto-status` 均通过。
- 审查返修后 mock 残留扫描通过：排除 `node_modules`、`dist`、`memory` 和 lockfile 后，源码/配置无 `MSW`、`setupWorker`、`mockServiceWorker`、`VITE_ENABLE_MOCKS`、`mocks/` 命中；`find` 未发现运行期 mock 文件或目录。
- Dashboard 首页补齐项目状态总览，并将项目下钻最终收口为“项目统计列表在上、所选项目详情在下”的连续布局。
- 检查模块泳道横轴阶段列展示阶段计划日期；Dashboard、泳道、检查项表和时间甘特均按启用阶段数量渲染，项目只启用 5 个阶段时其它视图展示 5 阶段。
- 配置中心检查项表补齐阶段列和阶段切换，新增检查项取消空日期前端硬阻塞，由后端在未传日期时继承所属阶段计划。
- 项目内检查项子资源查询补齐 `search/phase/module/status/is_enabled` 过滤，避免子资源查询参数误过滤父项目导致 404。
- 自回归通过：真实 HTTP 临时项目新增检查项、查询、修改阶段、删除检查项，并停用 1 个阶段后 dashboard 单项目统计返回 `phase_count=5`。
- 配置中心项目列表、项目阶段改为横向表格选行；点击阶段行后，下方展示阶段维护和该阶段检查项 CRUD。
- 新增“迁移本阶段检查项”批量动作，支持把被停用/裁剪阶段的检查配置迁移到其它阶段，同时继续支持逐条检查项切换阶段。
- 从 Dashboard 创建项目后默认进入配置中心，让用户在新项目创建后立即确认阶段与检查项配置；侧边栏配置中心移动到目录末尾。
- 本轮配置中心 UI 收口后重新执行 `npm run type-check`、`npm run build`、`git -C li-bs-auto-status diff --check` 均通过。
- 按 dev-environment-bootstrap 技能重启 3005，`GET http://127.0.0.1:3005/` 返回 HTTP 200。
- 复核用户反馈“检查项页不能新增”：后端新增接口和权限均正常，浏览器日志没有发出新增 POST；原因是检查项页此前只有台账/负责人维护，没有创建表单。
- 检查项页已补直接新增表单，复用真实 `/projects/{id}/check-items/`；缺标题、阶段、模块或只读态时在按钮旁给出原因。
- 新增入口修复后重新执行 `npm run type-check`、`npm run build`、`git -C li-bs-auto-status diff --check` 通过；真实 HTTP 创建检查项 201 并删除回归项 204；3005 重启后返回 HTTP 200。
- Dashboard 首页撤回项目统计表行内详情 `<tr>`：`ProjectStatisticsList` 只负责横向统计表、选中态、行点击和 Enter/Space 键盘选择；所选项目详情改由列表下方的 `ProjectDashboardExpansion` 连续区域承载。
- 列表下方详情区承载 Project Context、单项目统计、阶段轨、范围统计、详情筛选、模块泳道、检查项详情、重点问题、碰撞一页纸和导出操作；顶层保留范围工具、项目总览和项目统计列表，项目筛选归入项目统计列表栏。
- Dashboard 检查详情区继续收口为“上选下详”：详情筛选、检查模块泳道、检查清单详情顺序堆叠，不再使用 xl 侧边详情。
- Dashboard 重点问题表改为“表格选择在上、问题详情在下”：`KeyIssueTable` 内部选中第一条问题，支持行点击、按钮点击和 Enter/Space 选择；详情展示问题标题/描述、照片 bucket/object key、整改对策、整改完成时间、供应商、责任人、确认人、进度、备注、附件、关闭时间、状态和严重度，不新增 API 或 mock。
- 本轮泳道与重点问题“上选下详”返修后重新执行 `npm run type-check`、`npm run build`、`git diff --check`、`npm run permission-regression` 均通过；权限三态因本地缺少测试 cookie/模式不匹配按脚本规则 SKIP，失败数 0。
- 本轮 Dashboard 列表下方详情改造后重新执行 `npm run type-check`、`npm run build`、`git diff --check`、`npm run permission-regression` 均通过；权限三态因本地缺少测试 cookie/模式不匹配按脚本规则 SKIP，失败数 0。
- 审核返修：Dashboard 列表下方详情改为只跟随当前可见项目统计列表，若项目筛选隐藏当前选中项目，则不再继续展示该隐藏项目详情。
- 用户澄清返修：Dashboard 项目筛选归入项目列表栏，`ProjectStatisticsList` 在同一 panel 内承载筛选区和横向项目统计表，顶层顺序保持 ScopeToolbar -> PortfolioOverview -> ProjectStatisticsList -> ProjectDashboardExpansion。
- 本轮最终重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200；后端 `GET http://127.0.0.1:8000/api/auth/csrf/` 返回 HTTP 200。
- 本轮泳道/重点问题返修后再次重启 3005，`GET http://127.0.0.1:3005/` 返回 HTTP 200。
- Dashboard 顶层筛选下线：首页不再渲染 `ScopeToolbar`，sticky header 不再放项目下拉、导出和刷新；顶部收敛为 `li-bs-auto-status` 应用自身介绍、用户信息和明暗切换，不再跟随当前选中业务项目。
- Dashboard 模块视觉层级优化：新增 `DashboardLayer` 与对应样式，将项目状态、阶段检查、风险与签核分成带轨道线的纵向层级，改善连续 panel 堆叠的扫描体验。
- 本轮顶层筛选下线与 Dashboard 视觉层级优化后重新执行 `npm run type-check`、`npm run build`、`git diff --check`、`npm run permission-regression` 均通过；权限三态因本地缺少测试 cookie/模式不匹配按脚本规则 SKIP，失败数 0。
- 用户澄清返修：顶部导航固定展示 Auto Status 应用自身信息，不读取当前业务项目名称、编号、路径或状态；返修后重新执行 `npm run type-check`、`npm run build`、`git diff --check`、`npm run permission-regression` 均通过。
- Dashboard 首页新增全量统计与子项目图表层：项目状态环形图、检查项闭环环形图、子项目完成率柱状图和子项目风险压力柱状图，图表不参与筛选并保留数值图例。
- 按 dev-environment-bootstrap 技能重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200；后端 `GET http://127.0.0.1:8000/api/auth/csrf/` 返回 HTTP 200。

### 问题与风险

- `package.json` 当前没有 `lint` 脚本，无法执行前端 lint。
- 真实附件上传入口仍依赖后端上传/下载联调；当前 dashboard 展示附件入口和已有附件下载信息。

## 2026-05-14

### 今日目标

- 按用户反馈把 Dashboard/Home 改为项目汇总入口，不在首页展开单项目复杂详情。
- 首页项目卡展示阶段导航与进度，并提供跨模块跳转入口。

### 完成事项

- Dashboard 保留项目总览和精简图表，项目区域改为入口卡片，不再渲染单项目统计、泳道、检查项详情、重点问题详情和碰撞一页纸正文。
- 项目卡新增圆点 + 连线 + 阶段名称 + 日期 + 进度条的横向阶段轨，优先读取 `/dashboard/projects/` additive `phase_progress` / `stat.phaseProgress`。
- `phase_progress` 暂缺时用 `currentPhaseName`、`phaseCount` 和项目完成率做降级，不新增 mock，不发起逐项目 detail/timeline N+1。
- 项目卡新增跳转到阶段进度、检查项、重点问题、碰撞一页纸和配置中心的按钮，跳转前设置全局当前项目。
- 阶段进度、检查项、重点问题、碰撞一页纸和报告导出模块新增当前项目筛选条，模块切换默认沿用全局当前项目。
- 保持现有只读权限逻辑：只读用户仍可查看模块，写操作仍由原有 `canWrite` 控制。
- 首页项目卡阶段轨补齐每阶段检查项完成摘要，展示 `完成数/总数 检查项`；阶段日期改为计划开始/结束双行展示，修复半宽卡片内日期被截断的问题。
- 首页项目卡阶段轨下线横向滚动：5/6 阶段按卡片宽度等分，6 阶段自动进入紧凑模式，用户打开首页即可看到完整阶段清单。
- 首页项目卡阶段排期改为按 ISO 周展示，精确日期保留在 tooltip；阶段进度页时间甘特横轴同步改为周刻度，阶段/检查项条仍按日期计算位置。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `npm run permission-regression` 通过，三态 cookie 缺失场景按脚本规则 SKIP，失败数 0。
- `GET http://127.0.0.1:3005/` 返回 HTTP 200。
- `GET http://127.0.0.1:8000/api/auth/csrf/` 返回 HTTP 200。
- 真实 `/api/li-bs-auto-status/v1/dashboard/projects/` 返回 dev 后端项目数据，每个 `phase_progress` 均包含 `completed_check_item_count/check_item_count`。
- Playwright 截图 `/tmp/li-bs-auto-status-home-full-136.png` 确认首页项目卡日期不截断，且每阶段显示检查项完成简报。
- Playwright 截图 `/tmp/li-bs-auto-status-home-no-phase-scroll.png` 确认首页项目卡 5/6 阶段均不再出现横向拖动条。
- Playwright 截图 `/tmp/li-bs-auto-status-home-week-progress.png` 与 `/tmp/li-bs-auto-status-timeline-week-progress.png` 确认首页阶段轨和阶段进度甘特均按周展示。

### 问题与风险

- 旧响应缺少 `phase_progress` 时仍走摘要字段暂缺降级展示；dev 正式数据已由真实后端返回阶段日期和检查项计数。

### 检查项多责任人完成事项

- 前端类型新增 `CheckItemOwner`，`CheckItem` 增加 `owners` 数组，同时保留旧 `ownerName` / `ownerIdaasId` 快照字段。
- API adapter 已兼容后端 `owners` 数组；创建/更新检查项时提交 `owners`，并将第一位责任人同步写入 `owner_name` / `owner_idaas_id` 及 metadata 快照。
- 集成硬化：前端 owner normalize/serialize 保留 `manual_name`、`role`、`sort_order`、`is_primary`、`metadata` 等后端字段；增删责任人保存时按当前列表顺序生成 `sort_order`，候选人新增默认 `role=owner`，手工输入继续写入 `displayName`。
- OwnerListEditor 移除按钮改用 lucide `X` 图标，避免裸文本 `x`。
- 后端 `normalize_check_item_owner_payloads` 对非法 `sort_order` 按输入顺序兜底；未显式主责任人时按最终排序后的第一条设为主责任人，并同步 API README 契约说明。
- 检查项台账页和配置中心检查项表/新增表单支持候选人添加、手工输入添加和移除责任人，只读态禁用添加、移除、保存和新增。
- 检查项台账、配置中心检查项和时间甘特筛选已改为命中所有责任人的姓名、IDaaS ID、邮箱和部门。

### 检查项多责任人验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `cd li_sicar && source scripts/backend-dev-env.sh && .venv/bin/python manage.py test li_bs_auto_status` 通过，26 tests OK。

### 后端数据口径收口

- 前端继续完全下线 mock，本轮同步取消对 `BS-AUTO-PROTOTYPE` 原型样例项目的展示假设。
- 后端迁移保留默认阶段模板、检查模块和检查项模板作为可复用配置，dev 展示与回归直接读取正式项目 API 数据。
- dev 数据库迁移后确认 `BS-AUTO-PROTOTYPE=0`、默认模板 `bs-auto-status-five-phase/bs-auto-status-six-phase` 存在、默认模块 7 个、检查模板 18 组。

### 检查项状态更新与审计收口

- 后端 `set-status` 接口补充 `source/comment` 入参，状态审计 detail 记录新旧状态、来源、是否变化、阶段、模块、完成时间和完成人。
- 后端 `PATCH /check-items/{id}/` 保存检查项配置时若状态变化，也写入 `check_item.status_change`，避免配置中心状态变更缺少专用审计链路。
- 阶段进度页在甘特图下方增加按阶段分组的检查项状态维护表；检查项台账页状态列新增同源状态更新控件。
- 前端统一通过真实后端 `POST /check-items/{id}/set-status/` 更新状态，操作者追溯由后端 IDaaS 审计字段完成，不从前端提交用户身份。
- 验证通过：`npm run type-check`、`npm run build`、`cd li_sicar && .venv/bin/python manage.py test li_bs_auto_status`。
- 甘特检查项条改为可点击选中；下方面板显示所选检查项、当前状态、最近状态更新人/时间，并可直接保存新状态。
- 新增 `AuditHistoryPanel`，通过真实 `/audit-logs/` 查询该检查项审计历史，表格展示动作、状态变化、操作者、来源、请求 ID。
- 本轮前端补强验证通过：`npm run type-check`、`npm run build`。
- 所选检查项面板新增附件上传/下载：上传复用后端 `/attachments/upload/`，下载复用 `/attachments/{id}/download-link/`，只读态禁用上传和下载按钮。
- HTTP 请求层支持 multipart `FormData`，上传时不再自动设置 JSON `Content-Type`。
- 附件入口补强后重新执行 `npm run type-check`、`npm run build` 通过。
