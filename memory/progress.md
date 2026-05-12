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
- 审查修复：导出任务不再直接渲染 `content_url` / mock 下载 URL，点击下载时调用 `/export-jobs/{id}/download-link/`，403 作为页面内无权限提示处理。
- 审查修复：`/idaas-candidates/` 负责人候选兼容 snake_case 后端返回与候选集合包装，仍保留负责人手工输入。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `git -C li-bs-auto-status diff --check` 通过。
- `npm run permission-regression` 通过，失败数 0；当前缺少只读/可写 cookie，三态场景按脚本规则 SKIP。
- `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### 问题与风险

- `package.json` 当前没有 `lint` 脚本，无法执行前端 lint。
- 真实附件上传入口仍依赖后端上传/下载联调；当前 dashboard 展示附件入口和已有附件下载信息。
