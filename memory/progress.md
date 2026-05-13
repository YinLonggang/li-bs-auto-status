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
- 最终 API 契约覆盖 dashboard 项目统计、单项目详情 timeline、项目 timeline、阶段/检查项 PATCH/DELETE。
- 完全下线本地填充数据与浏览器请求拦截器，dev 验收只使用真实后端 seed 原型数据；后端无数据时页面展示空态。
- 删除 MSW、`mocks/`、`mockServiceWorker.js`、`VITE_ENABLE_MOCKS`，mock 下线门禁扫描源码、public、env、package、node_modules 均为 0 命中。
- Dashboard 项目统计补齐 `planned_start` / `planned_end`、阶段逾期和检查项逾期字段兼容；逾期总数缺失时由两类逾期相加。
- 基础配置默认阶段/检查项删除入口下线，只有后端返回 `can_delete=true` 的自定义项才展示删除；默认项通过启用/停用维护。
- 导出任务下载按钮改为使用 `has_result` 判断，timeline 项目 ID 兼容顶层 `project_id` 与 `project.id`。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `git -C li-bs-auto-status diff --check` 通过。
- 3005 真实后端 DOM smoke 通过，38 个 `/api/...` 请求，`mock_resources: []`。
- `npm run permission-regression` 通过，失败数 0；当前缺少只读/可写 cookie，三态场景按脚本规则 SKIP。
- `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### 问题与风险

- `package.json` 当前没有 `lint` 脚本，无法执行前端 lint。
- 真实附件上传入口仍依赖后端上传/下载联调；当前 dashboard 展示附件入口和已有附件下载信息。
