# li-bs-auto-status 前端架构记录

## 2026-05-13 Dashboard 收口

- 默认入口为 `dashboard`，首屏承载项目选择、总完成率、导出入口、层级筛选、阶段轨道、检查模块泳道、检查项详情、重点问题表、碰撞一页纸、签核状态和附件入口。
- 数据接入优先走 `/api/li-bs-auto-status/v1/dashboard/` 聚合接口，项目列表与 dashboard 查询统一透传 `project`、`factory`、`workshop`、`production_line`、`status` 筛选参数。
- 项目创建遵循后端最终口径：`factory` / `workshop` 必选，`production_line` 可选；产线为空表示车间级项目。
- 基础数据级联读取 `/api/v1/base/factories/`、`/api/v1/base/workshops/`、`/api/v1/base/lines/`，后端不可用时用项目快照兜底，避免界面空白。
- mock 数据继续以用户原型 `PHASES` / `MODULES` 为基线，覆盖六阶段、7 模块、检查项标签、重点问题字段和碰撞一页纸字段；KeyIssue 原型重点问题表字段在后端已是正式列，前端类型直接兼容这些字段。
- 导出任务列表只展示状态、文件名、文件大小、内容类型和时间等安全元信息；下载统一通过管理员动作 `/api/li-bs-auto-status/v1/export-jobs/{id}/download-link/` 获取短链，禁止直接把 `content_url`、bucket/object key 或 mock URL 渲染为链接。
- 负责人候选接口保持 `/api/li-bs-auto-status/v1/idaas-candidates/`，前端 adapter 接受 snake_case 候选字段和候选数组包装；候选不可用时回退为空列表，负责人字段仍可手工输入。
