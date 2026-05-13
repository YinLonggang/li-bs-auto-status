# li-bs-auto-status 前端架构记录

## 2026-05-13 Dashboard 收口

- 默认入口为 `dashboard`，首屏承载项目选择、总完成率、导出入口、层级筛选、阶段轨道、检查模块泳道、检查项详情、重点问题表、碰撞一页纸、签核状态和附件入口。
- 数据接入优先走 `/api/li-bs-auto-status/v1/dashboard/` 聚合接口，项目列表与 dashboard 查询统一透传 `project`、`factory`、`workshop`、`production_line`、`status` 筛选参数。
- 项目创建遵循后端最终口径：`factory` / `workshop` 必选，`production_line` 可选；产线为空表示车间级项目。
- 基础数据级联读取 `/api/v1/base/factories/`、`/api/v1/base/workshops/`、`/api/v1/base/lines/`，后端不可用时用项目快照兜底，避免界面空白。
- 原型体验数据由真实后端 seed 提供，覆盖六阶段、7 模块、检查项标签、重点问题字段和碰撞一页纸字段；KeyIssue 原型重点问题表字段在后端已是正式列，前端类型直接兼容这些字段。
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
- 阶段和检查项启停/排序/时间字段收口为 `is_enabled`、`planned_start`、`planned_end`，阶段走 `/project-phases/{id}/`，检查项走 `/check-items/{id}/`，并在基础配置页提供 DELETE 操作。
- Dashboard 聚合继续读取 `/dashboard/`，新增逾期字段 `overdue_count` 和项目摘要 `project_summaries`；项目统计列表优先读取 `/dashboard/projects/`。
- 单项目统计优先读取 `/dashboard/projects/{project_id}/`，并接收其中的 `timeline`；时间甘特优先读取 `/projects/{id}/timeline/`，缺省时回退项目阶段/检查项 bundle。
- 最终 API 路由：`/dashboard/projects/`、`/dashboard/projects/:projectId/`、`/projects/:projectId/timeline/`、阶段/检查项 PATCH/DELETE。

## 2026-05-13 真实后端数据收口

- 前端运行时完全依赖真实后端 API 与 seed 原型数据，不再注册浏览器请求拦截器，也不保留本地填充数据文件。
- MSW、`mocks/`、`mockServiceWorker.js`、`VITE_ENABLE_MOCKS` 与本地填充数据已删除；dev、build、type-check 逻辑不再包含本地数据兜底，后端无数据时页面展示空态。
- Dashboard 项目统计兼容 `planned_start` / `planned_end`、`overdue_phase_count` / `overdue_check_item_count`；未返回总逾期数时前端以阶段逾期 + 检查项逾期计算。
- 默认六阶段和 seed 检查项不展示删除入口，基础配置页以 `is_enabled=false` 作为停用路径；删除入口仅在后端显式返回 `can_delete=true` 时出现。
- 导出任务下载按钮只以 `has_result=true` 判断是否可下载，不再用对象键推断权限或产物可用性。
