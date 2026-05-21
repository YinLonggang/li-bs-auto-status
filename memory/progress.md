# li-bs-auto-status 进度记录

## 2026-05-21

### 负责人头像缓存刷新

- 目标：修复历史负责人头像仍显示旧快照的问题，并保持头像来源由顶层 `li_sicar` IDaaS/Mongo 用户资料缓存统一提供。
- 完成：前端 API adapter 在历史 owner fallback 中读取后端 `owner_avatar_url`；检查项/模块 owner 正常化继续优先使用后端返回的只读头像字段。
- 口径：当前应用没有 IDaaS 全员姓名实时搜索权限，候选人搜索仍仅覆盖当前登录用户、本地 Mongo 用户资料缓存和历史业务快照；未登录同步进缓存的用户不能被搜索选中。
- 验证：`npm run type-check`、`npm run build` 与 `git diff --check` 通过；后端 Auto Status 全量测试 60 tests OK。

## 2026-05-20

### 负责人候选搜索与分包警告

- 定位负责人候选链路：页面加载和负责人编辑器均调用 `/idaas-candidates/`；前端本地候选缓存只来自 workspace `ownerCandidates`，动态搜索由 `OwnerListEditor` 输入关键字后触发。
- 后端候选原先只来自当前登录用户和 Auto Status 业务表中已保存的负责人/确认人/审批人快照；空业务数据时自然只剩当前登录用户。
- 本轮保持前端链路不变，由后端在关键字搜索时补充 IDaaS profile 缓存候选；当前登录用户仍作为默认候选，搜索可返回其他真实 IDaaS 用户。
- `vite.config.ts` 增加 Rollup `manualChunks`，拆分 `react`、`icons`、`imageExport` chunks；`npm run build` 产物最大业务 chunk 为 `471.79 kB`，不再出现 `chunk > 500 kB` 警告。

### 负责人候选验证

- `npm run type-check` 通过。
- `npm run build` 通过，构建输出包含 `react`、`imageExport`、`icons`、`index` 四个 JS chunks，无 500 kB 警告。
- 后端定向候选测试通过；完整 `li_bs_auto_status` 后端测试与 `manage.py check` 已在后端 memory 记录。

### 明暗主题状态色复核

- 复核 Auto Status 的 `success/warning/primary/accent` 状态文字，现有代码已通过 CSS 主题变量或深色 light token 保持浅底可读，本轮无需继续修改组件代码。
- 复核剩余 `teal` 命中均来自碰撞一页纸 Excel 白底版式：深 `teal-700` 底配白字或输入 focus 边框，不属于浅色文字压浅底问题。

### 亮色主题成功态可读性

- 定位成功/提示态主要来自 `success` Tailwind token：`StatusPill`、保存提示、共享盘配置成功消息和超级管理员 badge 均使用 `bg-success/10 text-success`。
- 将 `success` 从固定 `#16a34a` 改为读取 CSS 主题变量；暗色主题保持 `22 163 74`，亮色主题改为更深的 `22 101 52`，提升浅绿色背景上的文字对比度。
- 仅修改 `li-bs-auto-status` 内主题样式文件，未修改 `li-sicar-iot` 或根仓业务代码。

### 生产 API 基址环境变量兼容

- 修复生产构建只注入 `VITE_BASE_API` 时 Auto Status 仍使用同源或旧后端基址的问题。
- `config.ts` 改为按 `VITE_BASE_API -> VITE_API_BASE -> VITE_API_BASE_URL` 顺序读取第一个非空值，并统一去掉尾部 `/`。
- `.env.example` 补充 `VITE_BASE_API=http://127.0.0.1:8000` 和 `VITE_API_BASE`，保留 `VITE_API_BASE_URL` 作为兼容变量。
- 排查控制台 `content_main.js` / Chrome Built-In AI / message channel closed 报错：仓库源码中无对应脚本、无 `chrome.runtime` listener，判断为浏览器扩展或 Chrome 注入脚本，不属于 SPA 业务代码。
- 验证通过：`npm run type-check`；`VITE_BASE_API=https://li-sicar.inner.chj.cloud npm run build`；构建产物包含 `https://li-sicar.inner.chj.cloud`。

## 2026-05-19

### 生产构建产物目录

- 定位生产构建 artifact 收集失败原因：发布平台声明读取 `build/`，但 Auto Status 未显式配置 Vite 输出目录，默认产出 `dist/`。
- 已在 `vite.config.ts` 增加 `build.outDir='build'` 和 `emptyOutDir=true`，对齐其他运行期 SPA。
- `.gitignore` 补充 `build/`，保持生产构建产物不入库。
- 验证通过：`npm run type-check`、`npm run build`，并确认生成 `build/index.html`。

### 宽屏空白区优化

- 移除 Auto Status 主内容 `.page-shell` 的居中最大宽度限制，桌面端主内容改为占满侧边栏外的剩余空间。
- 顶部 header 内层从 `max-w-[1520px] mx-auto` 改为全宽布局，避免页面标题和业务内容在宽屏上整体右移。
- 主内容容器补齐 `w-full`，折叠/展开侧边栏时仍按原有 padding 切换，不改变移动端抽屉行为。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过；Vite 仍提示主 chunk 略高于 500 kB，这是既有性能提示，不影响本轮布局变更。
- 按 `dev-environment-bootstrap` 重启后，Django 8000、SPAs 3000-3005、堡垒机 38443/18080 与 Caddy 3050/8443 健康检查均为 HTTP 200。

## 2026-05-17

### 项目模板与项目实例体验拆分

- 配置中心项目范围筛选与项目实例列表只展示项目实例，不再把初始化模板下拉混入列表筛选区。
- 新增独立“创建项目实例”折叠区，承载工厂/车间/产线范围选择、初始化模板选择和“创建项目实例”按钮，并说明初始化模板不会修改已有项目。
- 项目模板模块、模板页和相关保存/删除提示统一改为“项目模板源数据”；配置中心补齐动作改为“按默认模板补齐项目实例”。
- 阶段页移除并列阶段模板展示；Settings fallback 移除阶段模板、检查项模板和负责人候选列表，只展示检查模块状态。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check`。

### 重点问题字段级通用附件上传

- 重点问题描述、对策、进展、备注四个字段新增多文件上传入口，支持图片、Excel、PPT、PDF 等普通附件。
- 上传前若是新增重点问题，填写标题后会先创建重点问题，再以 `object_type=key_issue` 绑定附件；上传 metadata 写入字段槽位和 `source=file_upload`。
- 重点问题附件列表继续复用受控图片缩略图、普通文件卡片、说明、下载和删除能力；列表列名从“照片”改为“附件”并显示附件数量。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check`；按 dev-environment-bootstrap 重启 3005 后，`GET http://127.0.0.1:3005/` 返回 HTTP 200，后端 `/api/auth/csrf/` 返回 HTTP 200。

### 重点问题附件去重与模块负责人

- 重点问题编辑区取消底部全量附件列表，只保留描述、对策、进展、备注字段下的槽位附件展示，避免同一附件重复显示。
- 检查模块补齐负责人读取和保存能力：模块负责人来自 IDaaS 候选人，保存到模块 `owner_*` 快照和 `metadata.owners`。
- 配置中心“检查模块”列表新增模块负责人编辑器，并提供“应用到检查项”批量动作，把当前项目中同模块检查项负责人统一更新为模块负责人。
- 新增检查项时会按所选模块带出模块负责人；检查项级负责人仍允许单独覆盖。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check`；按 dev-environment-bootstrap 重启 3005 后，`GET http://127.0.0.1:3005/` 和后端 `/api/auth/csrf/` 均返回 HTTP 200。

### 项目模板独立模块

- 侧边栏新增“项目模板”模块，创建项目模板和模板检查项维护从配置中心剥离，配置中心只保留项目实例和模块负责人配置。
- 项目模板页独立列出后端 `PhaseTemplate`，展示模板版本、阶段数、清单模板数、模板检查项数和启用状态。
- 用户点击项目模板后，下方横向表格展示该模板下的 `ChecklistTemplate`；再点击清单模板后，可以维护 `item_templates`。
- 模板检查项支持新增、删除、修改排序、标题、描述/验收口径、优先级、计划开始、计划结束和启用状态；保存走 `PATCH /checklist-templates/{id}/`。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check`；`GET /phase-templates/`、`GET /checklist-templates/`、后端 `/api/auth/csrf/` 和 3005 SPA 均返回 HTTP 200。

### 项目模板矩阵 CRUD 与复制

- 项目模板页从普通清单表升级为“检查模块 × 项目阶段”矩阵，用户可按模块和阶段直接选择或新增对应清单模板。
- `PhaseTemplate` 支持新增、编辑编码/名称/版本/说明/启用状态/阶段定义、复制草稿和删除；复制草稿默认停用，并写入 `metadata.copied_from`。
- `ChecklistTemplate` 支持矩阵单元格新增、编辑编码/名称/模块/阶段/版本/启用状态、删除和维护模板检查项。
- 删除阶段模板前会删除其关联清单模板，避免后端 FK 置空后留下孤儿模板配置。
- 配置中心按范围创建项目新增项目模板下拉，且只列出启用模板；草稿模板需启用后才能用于创建项目。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check -- App.tsx services/bsAutoStatusApi.ts types/index.ts`；按 dev-environment-bootstrap 重启 3005 后，`GET /api/auth/csrf/`、`GET /phase-templates/`、`GET /checklist-templates/` 和 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 检查模块可编辑

- 项目模板页新增“检查模块维护”区，模块矩阵行可在同页完成新增、编辑和删除。
- 模块字段覆盖编码、名称、说明、排序、启用状态和 IDaaS 负责人；负责人继续写入 `metadata.owners` 并同步第一负责人快照。
- 前端服务层新增 `createInspectionModule`、`updateInspectionModule`、`deleteInspectionModule`，并让原模块负责人保存复用同一 update 入口。
- 模板矩阵和清单模板模块下拉使用最新模块列表；保存模块后刷新 workspace 数据。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check -- App.tsx services/bsAutoStatusApi.ts types/index.ts`；按 dev-environment-bootstrap 重启 3005 后，`GET /api/auth/csrf/`、`GET /inspection-modules/` 和 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 配置中心项目检查矩阵

- 配置中心新增项目实例“模块 × 阶段矩阵”，矩阵行读取检查模块，列读取当前项目阶段。
- 矩阵单元汇总检查项总数、完成数和启用数；点击后下方仅显示该模块 + 阶段的检查项。
- 新增检查项表单跟随所选矩阵单元，默认填入阶段、模块、阶段计划日期和模块负责人。
- 保留阶段表、阶段编辑、阶段级检查项迁移、项目基础信息和模块负责人维护。
- 验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`git diff --check -- App.tsx`。
- 按 dev-environment-bootstrap 重启 3005 后，`GET http://127.0.0.1:3005/`、后端 `/api/auth/csrf/` 和 `/api/li-bs-auto-status/v1/inspection-modules/` 均返回 HTTP 200。

## 2026-05-16

### 今日目标

- 将碰撞一页纸前端输入体验从字段下方附件列表升级为结构化 block 画布，支持 1/2/3/4/5 分区字段直接粘贴图片、预览、说明和删除。

### 完成事项

- 前端类型新增 `CollisionReportBlock` / `CollisionBlockType`，`CollisionReport` 增加 `blocks`；API adapter 兼容 block snake_case/camelCase 字段，并在后端未返回 blocks 时从历史附件 metadata 生成 image blocks。
- 碰撞一页纸编辑画布新增 `CollisionBlockGallery`：每个摘要/正文槽位都有可聚焦贴图区，粘贴后先展示本地上传中缩略图，后端刷新后按 report blocks 展示真实图片。
- 上传 `/attachments/upload/` metadata 增加 `section_key`、`collision_slot`、`collision_slot_label`、`caption`、`sort_order`、`source=clipboard_paste`；新增态粘贴会明确提示并自动创建草稿报告。
- 图片说明继续复用 `/attachments/{id}/metadata/`，保存时合并原 metadata，避免丢失槽位信息；图片删除/下载继续沿用现有附件动作和权限。
- Dashboard 碰撞一页纸摘要改为只读 Excel 画布，图片使用同一 block gallery 预览；编辑画布移除用户可见“图片对象引用”输入。
- 顶部摘要表不再渲染图片粘贴/上传占位；摘要字段粘贴图片会被前端拦截，1/2/3/4/5 正文分区继续保留图片粘贴、预览、说明、删除和下载能力。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。

### 问题与风险

- 结构化 blocks 依赖后端新字段发布；后端暂未返回 blocks 时前端仅能基于历史图片附件 metadata 生成展示用 image blocks。

## 2026-05-15

### 重点问题图片缩略图返修

- 重点问题新增/编辑表单移除图片 Bucket、图片 Key 输入控件；旧 `problemPhotoBucketName/problemPhotoObjectKey` 字段仅保留为内部兼容字段，不再作为用户可见维护项。
- 通用附件列表增强为图片缩略图网格：图片通过 `/attachments/{id}/preview/` Blob 通道直接显示缩略图，点击缩略图打开既有 lightbox；非图片附件仍以文件行展示。
- 重点问题描述、对策、进展、备注四个字段下方按附件 metadata 槽位直接展示对应附件区域；图片缩略图和非图片文件行均不暴露 bucket/object key/downloadUrl。
- 导出任务列表同步隐藏产物 bucket/object key 明细，仅显示文件名、错误信息或“导出产物已生成”状态。
- 验证通过：`npm run type-check`、`npm run build`、`git diff --check`；按 dev-environment-bootstrap 重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### 附件删除与单图说明

- 附件列表新增管理员删除按钮，图片 lightbox 中也保留删除入口；删除成功后刷新当前项目数据。
- 每张图片拥有独立说明输入和保存按钮，重点问题与碰撞一页纸多图贴图不再共享同一个栏位说明。
- 前端上传图片时只绑定业务对象和栏位槽位，说明后续写入该附件自身 `metadata.caption`，供页面展示和 Excel 导出复用。
- 本轮前端验证通过：`npm run type-check`、`npm run build`；按 dev-environment-bootstrap 重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### Auto Status SMB 配置入口

- 侧边栏独立“附件共享盘”模块维护 `li_bs_auto_status` scope 的 SMB URL、host/share、业务根路径、凭据、对象前缀、环境目录和传输参数；该配置对所有 Auto Status 项目实例共享。
- 配置中心已移除共享盘面板，避免共享存储配置被理解为当前项目的附属配置。
- 面板通过 `/api/shared-storage/v1/profiles/li_bs_auto_status/` 读取/保存配置，通过 `/test/` 做连接验证；保存和验证受 `li_bs_auto_status` 模块写权限控制，只读账号可查看但不能修改。
- 前端类型新增 `SharedStorageProfile`，API adapter 新增 `fetchSharedStorageProfile`、`updateSharedStorageProfile`、`testSharedStorageProfile`。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`（cookie 缺失场景按脚本规则 SKIP，失败数 0）、`git diff --check`。
- 按 dev-environment-bootstrap 重启 3005 后，`GET http://127.0.0.1:3005/`、`GET /api/auth/csrf/` 和 `GET /api/shared-storage/v1/profiles/li_bs_auto_status/` 均返回 HTTP 200。

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
- 审查修复：`/idaas-candidates/` 负责人候选兼容 snake_case 后端返回与候选集合包装；检查项责任人后续收口为仅支持 IDaaS 候选。
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
- 侧边栏配置入口收敛为“配置中心”，项目列表、项目基础信息、六阶段、阶段检查项和模块负责人配置在同一工作台完成。
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
- Dashboard 重点问题表改为“表格选择在上、问题详情在下”：`KeyIssueTable` 内部选中第一条问题，支持行点击、按钮点击和 Enter/Space 选择；详情展示问题标题/描述、照片配置状态、整改对策、整改完成时间、供应商、责任人、确认人、进度、备注、附件、关闭时间、状态和严重度，不新增 API 或 mock。
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
- 集成硬化：前端 owner normalize/serialize 保留 `role`、`sort_order`、`is_primary`、`metadata` 等后端字段；增删责任人保存时按当前列表顺序生成 `sort_order`，候选人新增默认 `role=owner`，`manual_name` 运行期置空。
- OwnerListEditor 移除按钮改用 lucide `X` 图标，避免裸文本 `x`。
- 后端 `normalize_check_item_owner_payloads` 对非法 `sort_order` 按输入顺序兜底；未显式主责任人时按最终排序后的第一条设为主责任人，并同步 API README 契约说明。
- 检查项台账页和配置中心检查项表/新增表单支持 IDaaS 候选人添加和移除责任人，只读态禁用添加、移除、保存和新增。
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
- 检查项责任人添加入口改为 IDaaS 搜索：`OwnerListEditor` 调用 `/idaas-candidates/?q=...` 动态搜索候选，去掉手工输入责任人；新增通用 `UserAvatar` 用于责任人 chip 和候选列表。
- 阶段进度甘特选中检查项面板补齐负责人保存能力，和检查项台账/配置中心共用同一责任人编辑器；检查项台账附件列改为同源上传/下载组件。
- 后端候选接口只返回带 `idaas_id` 的候选，检查项 `owners` 写入缺少 `idaas_id` 时返回 400。
- 本轮 IDaaS 责任人和附件一致性返修后验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`cd li_sicar && source scripts/backend-dev-env.sh && .venv/bin/python manage.py test li_bs_auto_status`（28 tests OK）、`makemigrations --check --dry-run`、`manage.py check`、`git diff --check`。
- 按 dev-environment-bootstrap 技能重启后端和 3005，`GET http://127.0.0.1:8000/api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。Playwright smoke 因当前包未安装 `playwright` 未执行。
- 重点问题页从卡片只读改为横向表格选行 + 下方新增/编辑表单；表单覆盖阶段、模块、检查项、标题、描述、严重度、状态、供应商、负责人/确认人、截止、对策、进展、备注。图片 bucket/key 用户可见入口已在 2026-05-15 返修中移除，仅保留内部兼容字段。
- 碰撞一页纸页从多卡片展示改为横向表格选行 + 下方新增/编辑表单；字段覆盖 phase、title、reportDate、status、riskLevel、summary、owner/dueDate 和 content 常用正式字段。
- 前端 API adapter 新增重点问题与碰撞一页纸 create/update/delete/import/export CSV 方法，保持提交到后端的 snake_case 映射；CSV 导入导出优先走后端专用端点，未提供时用正式 CRUD/List 做前端降级。
- 只读权限口径保持：页面、筛选和列表可见，新增、保存、删除、导入、导出均按 `canWrite` 禁用。
- CSV import/export 路径最终对齐后端集合动作：`/key-issues/import|export/?project=<id>` 与 `/collision-reports/import|export/?project=<id>`，旧项目子资源路径仅保留 404/405 fallback。
- 本轮前端收口验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`；按 dev-environment-bootstrap 重启后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### 审计历史与一页纸 Excel 导出

- 重点问题编辑区新增审计历史面板，按所选问题调用 `/audit-logs/?object_type=KeyIssue&object_id=<id>`；新增态显示保存后开始记录审计。
- 碰撞一页纸编辑区新增审计历史面板，按所选报告调用 `/audit-logs/?object_type=CollisionReport&object_id=<id>`；导出 Excel 后会刷新审计列表。
- 碰撞一页纸编辑区新增单份 `导出 Excel` 按钮，调用后端 `/collision-reports/{id}/export-excel/` 下载 `xlsx` Blob；项目级 CSV 导入/导出能力保持不变。
- 前端请求层新增 Blob 下载 API，避免 `xlsx` 响应被 JSON/text 解析。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`（三态 cookie 缺失场景按脚本规则 SKIP，失败数 0）；后端 `python manage.py test li_bs_auto_status` 通过，34 tests OK；`manage.py check` 通过，`makemigrations --check --dry-run` 输出 `No changes detected`；按 dev-environment-bootstrap 重启后端和 3005，`GET /api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 一页纸模板下载

- 碰撞一页纸模块头部新增 `下载模板` 按钮，调用后端 `/collision-reports/template/` 下载同正式版式的 Excel 模板。
- 模板下载走统一 Blob 下载通道，文件名优先读取后端 `Content-Disposition`，无文件名时兜底为 `collision_one_pager_template.xlsx`。
- 只读态沿用 `canWrite` 禁用模板下载入口，权限兜底由后端返回 403。
- 本轮验证：`npm run type-check`、`npm run build`、`npm run permission-regression` 通过，权限三态 cookie 缺失场景按脚本规则 SKIP，失败数 0；后端 `python manage.py test li_bs_auto_status` 通过，35 tests OK；按 dev-environment-bootstrap 重启后端和 3005 后，`GET /api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

## 2026-05-15

### 今日目标

- 让检查项、重点问题和碰撞一页纸附件列表支持受控图片预览，避免向普通用户暴露 object key。

### 完成事项

- 新增附件图片 lightbox：图片附件点击“预览”后走 `/attachments/{id}/preview/` Blob 通道展示，支持关闭按钮、遮罩关闭和 ESC。
- 附件下载继续通过 `/attachments/{id}/download-link/` 获取受控链接；只读账号或后端 `can_download=false` 时下载按钮禁用。
- 检查项附件上传保留原有 `/attachments/upload/` 链路；检查项台账与阶段进度页复用同一附件列表预览能力。
- 重点问题和碰撞一页纸编辑区补齐所选对象附件列表，支持图片预览和按权限下载已有附件。
- 通用附件列表不再渲染 `objectKey`、bucket 或后端直给 `downloadUrl`；重点问题列表/详情仅显示“已配置”照片状态，图片 Bucket/Key 字段后续已从管理表单移除。
- `Attachment` 类型与 adapter 兼容 `preview_url`、`can_preview`、`can_download`、`is_image`，并新增 `fetchAttachmentPreview` service。

### 验证

- `npm run type-check` 通过。
- `git diff --check` 通过。

### 问题与风险

- 图片预览依赖后端 `/attachments/{id}/preview/` 按登录态返回图片 Blob；若后端暂未发布该 endpoint，前端会在 lightbox 内展示加载失败提示。

### 碰撞一页纸输入界面 Excel 对齐

- 碰撞一页纸编辑区改为白底纸面式输入画布，布局对齐导出的 Excel：标题、品牌区、三行元信息、问题定义摘要表、双栏正文、现场图片/附件、诊断维修、制定措施和所需支持。
- 新增正式字段输入：信息来源、过程分析、根因结论和图片对象引用；API adapter 同步序列化到 `content/metadata`，CSV 降级导入导出也补齐对应列。
- 在现场图片区新增“插入图片”入口，保存后的报告可直接上传图片附件，上传使用 `object_type=collision_report` 并复用受控预览/下载组件。
- 本轮验证通过：`npm run type-check`、`npm run build`；按 dev-environment-bootstrap 重启后端和 3005，`GET /api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 碰撞一页纸字段级粘贴贴图

- 一页纸摘要栏位、正文栏位和补充栏位均支持在输入框内直接粘贴剪贴板图片，不再要求用户点击上传按钮。
- 每个栏位下方新增图片说明输入和该栏位图片附件列表，图片按附件 metadata 的 `collision_slot` 归类，继续复用受控图片预览与管理员下载。
- 新增 `content.imageCaptions` 前端模型与 API adapter 序列化，CSV 降级导出增加 `image_captions` 列。
- 本轮验证通过：`npm run type-check`、`npm run build`；按 dev-environment-bootstrap 重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### 粘贴体验与重点问题图片返修

- 剪贴板图片解析从单一 `clipboardData.items` 扩展到 `files/items/text-html data:image/text-plain data:image`，粘贴时先识别图片并阻止浏览器默认行为。
- 碰撞一页纸移除空栏位的粘贴提示，只在图片存在后显示图片说明和预览列表；画布容器可接收粘贴，默认归到最近聚焦栏位。
- 重点问题编辑区补齐描述、对策、进展、备注字段的直接粘贴图片能力，上传为 `object_type=key_issue` 附件并按栏位展示受控预览。
- 本轮验证通过：`npm run type-check`、`npm run build`；按 dev-environment-bootstrap 重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

### Dashboard 项目级审计入口

- Dashboard 首页项目卡新增审计下钻：点击卡片加载该项目下所有项目维度审计日志，模块跳转按钮继续保持原行为。
- 通用 `AuditHistoryPanel` 支持项目/对象列、标题和说明配置，供项目级和对象级审计共用。
- 前端 `fetchProjectAuditLogs()` 对 `/projects/{id}/audit-logs/` 自动翻页，默认每页 200 条，避免只展示第一页。
- 本轮前端验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`（三态 cookie 缺失场景按脚本规则 SKIP，失败数 0）、`git diff --check`；按 dev-environment-bootstrap 重启 3005 后 `GET http://127.0.0.1:3005/` 返回 HTTP 200。

## 2026-05-16

### 今日目标

- 修复碰撞一页纸字段先输入文字再粘贴图片后，未保存文字被刷新覆盖的问题。
- 让一页纸正文在网页编辑和预览中尽量完整显示，减少滚动框内截断。

### 完成事项

- 粘贴图片时会把当前输入框实时值合并到 `CollisionDraft`，已保存报告先执行 update 再上传附件，新建报告仍按现有链路自动创建草稿后绑定附件。
- 正文 textarea 按内容估算行数自动扩展；只读预览正文增加长文本换行，保证网页上能完整看到输入内容。
- 按 dev-environment-bootstrap 重启 `li-bs-auto-status` 3005，后端 8000 保持运行。

### 验证

- `npm run type-check` 通过。
- `npm run build` 通过。
- `npm run permission-regression` 通过，权限三态 cookie 缺失场景按脚本规则 SKIP，失败数 0。
- `git diff --check` 通过。
- `GET http://127.0.0.1:8000/api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 问题与风险

- 本次修复为前端草稿保护与展示优化，真实粘贴图片闭环仍依赖当前登录态、SMB 配置和后端附件上传接口可用。

### 下一步

- 在用户真实浏览器中复测：问题描述输入文字后直接粘贴图片，确认文字不丢失、图片归档到对应栏位、保存/导出链路保持正常。

### 字段级通用附件

- 碰撞一页纸字段附件区支持 `image/file` block 同源展示：图片缩略图可直接预览，Excel/PPT/PDF 等非图片附件以文件卡片展示。
- 每个正文栏位新增多文件上传入口，上传 Excel/PPT 等普通附件时仍按当前字段写入 `collision_slot` metadata，由后端同步为 `CollisionReportBlockType.FILE`。
- 一页纸 Excel 导出会把非图片附件按字段写入 `【附件N】文件名：说明` 文本引用，图片嵌入逻辑保持不变。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm run permission-regression`、`python manage.py test li_bs_auto_status`（51 tests OK）、`manage.py check`、`makemigrations --check --dry-run`、`git diff --check`。
- 按 dev-environment-bootstrap 重启后端和 `li-bs-auto-status` 3005，`GET /api/auth/csrf/` 与 `GET http://127.0.0.1:3005/` 均返回 HTTP 200。

### 一页纸图片预览下载

- 编辑区取消影响、预防、验证三个输入框；历史字段仍保留在前端 draft/API adapter 中，避免旧数据被破坏。
- 新增 `预览图片` 操作，使用 `html-to-image` 生成当前一页纸画布 PNG，先在弹窗预览，再点击下载图片。
- 截图生成时隐藏附件上传、下载、删除等操作按钮，并将输入控件样式降级为普通内容，保证下载图片更接近报告版式。
- 本轮前端验证通过：`npm run type-check`、`npm run build`、`npm audit --audit-level=high`、`npm run permission-regression`、`git diff --check`。

### dev-test 一页纸图片预览修复

- 定位 dev-test 预览失败主因：画布中的图片缩略图来自受控 `/attachments/{id}/preview/` Blob URL，`html-to-image` 追加 cache bust 查询串后会让 Blob URL 失效；同时长报告固定 `pixelRatio=2` 存在 canvas 过大风险。
- 前端 PNG 捕获改为 `cacheBust=false`，并增加字体/图片等待、`scrollWidth/scrollHeight` 尺寸捕获、动态像素比和 1x 降级重试；filter 增加节点类型保护，避免文本节点触发 `node.closest is not a function`。
- Chrome headless 真实浏览器回归通过：打开 3005，进入碰撞一页纸，选择 `dev-test`，点击 `预览图片` 后生成 PNG，尺寸 `2235 x 10736`。
- 本轮验证通过：`npm run type-check`、`npm run build`、`npm audit --audit-level=high`、`npm run permission-regression`、`git diff --check`；按 dev-environment-bootstrap 重启 3005 后，`GET http://127.0.0.1:3005/` 与 `GET /api/auth/csrf/` 均返回 HTTP 200。

## 2026-05-20

### 检查项列表密度与负责人头像

- 配置中心检查项表格、检查项列表和配置中心检查模块列表中的负责人维护改为默认头像栈展示，点击后再展开完整负责人搜索器，解决列表行被候选人搜索框和候选人卡片撑高的问题。
- 二次修正为右侧抽屉编辑：负责人搜索器不再渲染在表格单元格内，表格行只保留头像摘要按钮，点击后由 fixed drawer 承载候选人搜索和增删操作。
- 配置中心底部“模块与负责人候选”改为“模块负责人配置”紧凑表格，移除右侧负责人候选常驻列表；Settings fallback 也不再展示候选人列表。
- `UserAvatar` 支持真实头像 URL，图片加载失败时回退姓名/IDaaS 首字；前端 owner/candidate 类型、归一化和保存链路均补齐 `avatarUrl`。
- 后端 `/api/li-bs-auto-status/v1/idaas-candidates/` 候选人返回补齐 `avatar_url` 字段；候选来源包括当前登录用户、Mongo profile 缓存和已保存检查项 owner metadata。
- 检查项列表附件面板在 compact 模式下默认折叠上传控件，避免每一行直接展示文件选择器。
- 本轮验证通过：Auto Status `npm run type-check`、`npm run build`、`git diff --check`；后端 `manage.py check --settings=li_sicar.settings.dev` 与 `manage.py test li_bs_auto_status`（58 tests OK）通过；重启 8000 后端后，`GET http://127.0.0.1:3005/` 与 `GET /api/li-bs-auto-status/v1/idaas-candidates/?limit=2` 均返回 HTTP 200。右侧抽屉和模块负责人配置表修正后复跑 `npm run type-check`、`npm run build` 和 `git diff --check` 通过，3005 返回 HTTP 200。
