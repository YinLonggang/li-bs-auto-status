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
- 完全下线本地填充数据与浏览器请求拦截器，dev 验收只使用真实后端 seed 原型数据；后端无数据时页面展示空态。
- 删除 MSW、`mocks/`、`mockServiceWorker.js`、`VITE_ENABLE_MOCKS`，mock 下线门禁扫描源码、public、env、package、node_modules 均为 0 命中。
- Dashboard 项目统计补齐 `planned_start` / `planned_end`、阶段逾期和检查项逾期字段兼容；逾期总数缺失时由两类逾期相加。
- 基础配置默认阶段/检查项删除入口下线，只有后端返回 `can_delete=true` 的自定义项才展示删除；默认项通过启用/停用维护。
- 导出任务下载按钮改为使用 `has_result` 判断，timeline 项目 ID 兼容顶层 `project_id` 与 `project.id`。
- 侧边栏配置入口收敛为“配置中心”，项目列表、项目基础信息、六阶段、阶段检查项、模块/模板和负责人候选在同一工作台完成。
- 配置中心补齐检查项新增路径，调用真实 `/projects/{id}/check-items/`，并保持编辑、停用和自定义项删除路径。
- Dashboard 项目统计、Dashboard 模块泳道/检查项详情、配置中心项目/阶段/检查项、时间甘特、检查项表、重点问题、碰撞一页纸、报告定义和导出任务均补齐稳定筛选/搜索。
- 删除空 `li-bs-auto-status/mocks` 目录，运行期仍无 MSW、mock worker 或本地填充数据入口。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
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

### 问题与风险

- `package.json` 当前没有 `lint` 脚本，无法执行前端 lint。
- 真实附件上传入口仍依赖后端上传/下载联调；当前 dashboard 展示附件入口和已有附件下载信息。
