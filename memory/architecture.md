# li-bs-auto-status 前端架构记录

## 2026-05-20 明暗主题状态色复核

- Auto Status 状态文字继续通过 `primary/accent/success/warning` 语义 token 表达；亮色主题 token 已使用深色蓝、深青、深绿、深琥珀，暗色主题保持可读。
- 碰撞一页纸 Excel 画布内的 `bg-teal-700 text-white` 与白底输入框 focus teal border 属于固定报表版式，不是浅色文字压白底；后续主题修复不要把该版式误改成全局工作台 token。

## 2026-05-20 亮色主题成功态可读性

- Auto Status 的 `success` 语义色改为 CSS 主题变量，由 Tailwind `success` token 读取 `--success`。
- 暗色主题保持原成功绿 `22 163 74`；亮色主题使用更深的 `22 101 52`，用于 `bg-success/10 text-success`、状态 pill、保存提示和超级管理员标识等成功/提示态。
- 成功态背景透明度和组件结构不变，避免影响暗色主题布局与状态语义，只提升亮色主题浅绿色背景上的文字对比度。

## 2026-05-20 生产 API 基址环境变量

- Auto Status SPA 的后端基址优先读取 `VITE_BASE_API`，兼容 `VITE_API_BASE` 与旧变量 `VITE_API_BASE_URL`；读取时取第一个非空值并去除尾部 `/`。
- `LOGIN_URL` 未显式配置 `VITE_LOGIN_URL` 时由解析后的 API 基址拼接 `/login/`，保证部署到独立 SPA 域名后登录跳转仍回到 li-sicar 后端。
- Chrome 控制台中 `content_main.js`、Built-In AI `LanguageDetector` 和 message channel closed 报错不是 Auto Status 源码或构建产物触发，通常来自浏览器扩展/Chrome 注入脚本；本应用代码不注册 `chrome.runtime` listener。

## 2026-05-19 生产构建产物目录

- Auto Status SPA 的生产构建产物目录固定为 `build/`，与发布平台 artifact 声明 `path=["build/"]` 以及其他运行期 SPA 保持一致。
- `vite.config.ts` 显式配置 `build.outDir = "build"` 和 `emptyOutDir = true`，禁止依赖 Vite 默认 `dist/`，避免 build 脚本成功但 artifact 收集阶段找不到 `build/`。

## 2026-05-19 应用壳层宽屏布局

- Auto Status 桌面布局采用固定侧边栏 + 主内容占满剩余宽度的壳层口径；主内容不再用居中 `max-width` 容器承载业务面板。
- 顶部 header 与 `.page-shell` 使用一致的响应式页边距，宽屏下保留必要留白但不制造大面积左右空白区。
- Dashboard、配置中心、附件共享盘等业务页面仍在各自组件内部控制表格、图表和卡片密度；壳层只负责释放可用横向空间。

## 2026-05-17 项目模板与项目实例体验拆分

- 配置中心首屏收口为项目实例筛选、项目实例列表和所选项目实例维护；模板选择不再和项目实例列表筛选并列展示。
- 创建项目入口拆为独立“创建项目实例”折叠区，范围选择、初始化模板选择和创建按钮只在该区域出现；初始化模板文案明确仅用于新项目初始化，不修改已有项目。
- 项目模板模块统一命名为“项目模板源数据”，负责阶段模板、清单模板和模板检查项治理；配置中心“按默认模板补齐项目实例”仅作用于当前项目实例。
- 阶段页不再并列展示阶段模板；设置 fallback 只保留检查模块和负责人候选，避免模板源数据通过旧信息架构回流。

## 2026-05-17 配置中心项目检查矩阵

- 配置中心的项目实例检查项维护入口升级为“检查模块 × 项目阶段”矩阵：行来自 `InspectionModule`，列来自当前项目 `ProjectPhase`。
- 矩阵单元按真实 `CheckItem(module_id, project_phase_id)` 聚合，显示总数、完成数和启用数；点击单元后，下方检查项列表和新增表单只作用于该模块 + 阶段。
- 新增检查项默认继承所选矩阵单元的阶段、模块、阶段计划日期和模块负责人，仍调用正式 `/projects/{id}/check-items/` 创建。
- 阶段基础信息维护和“迁移本阶段检查项”保持阶段级语义；矩阵只负责定位模块阶段单元，不改变后端模型和权限。

## 2026-05-17 重点问题字段级通用附件

- 重点问题编辑区的描述、对策、进展和备注字段下方统一提供多文件上传入口，上传仍走 `/attachments/upload/`，对象绑定 `object_type=key_issue`、`object_id=<issue.id>`。
- 上传 metadata 固定写入 `key_issue_slot`、`key_issue_slot_label` 和 `source=file_upload`；粘贴图片继续使用同一入口但标记 `source=clipboard_paste`，因此图片和 Excel/PPT/PDF 等普通文件使用同一归档口径。
- 新建重点问题时，用户填写标题后上传附件会先创建重点问题记录，再绑定附件；只读态不展示上传入口，已有附件仍可按后端权限预览图片。
- 重点问题列表的“照片”列收口为“附件”列，显示附件数量，避免把普通文件误归为图片状态。

## 2026-05-16 碰撞一页纸结构化 block 画布

- `CollisionReport` 前端模型新增 `blocks: CollisionReportBlock[]`，adapter 兼容后端 snake_case/camelCase block 字段；后端未返回 blocks 时，前端按历史附件 `metadata.collision_slot/section_key/sort_order` 生成只读 image blocks，避免旧报告图片空白。
- 碰撞一页纸编辑区改为基于结构化 image block 的 Excel 风格画布：1/2/3/4/5 正文分区字段有可聚焦贴图区，粘贴图片先用本地 Blob URL 即时预览，再通过 `/attachments/upload/` 上传并等待刷新后的 report blocks 接管展示。
- 顶部摘要表仅维护问题定义、涉及零件、车型、故障频次、责任区域、负责人、问题进展和备注等纯字段，不渲染图片占位，也不接受图片粘贴上传；图片能力收口到 1/2/3/4/5 正文分区。
- 上传 metadata 固定写入 `section_key`、`collision_slot`、`collision_slot_label`、`caption`、`sort_order`、`source=clipboard_paste`；新增态粘贴仍可自动创建草稿报告，随后绑定附件。
- 图片展示优先读取 `selectedReport.blocks` 中对应 `section_key/slot_key` 的 image block，预览附件取 `attachment_detail`，缺省时按 report attachments fallback；图片说明读取附件 metadata caption 或 block caption，保存继续调用 `/attachments/{id}/metadata/`。
- Dashboard 一页纸摘要改为复用同一只读 Excel 画布，不再以独立卡片风格展示图片；用户可看受控预览，说明、删除、下载等写操作继续受 `canWrite`/附件 `can_download` 约束。
- 一页纸画布移除用户可见的“图片对象引用”输入，object key 仅保留为历史 API 字段兼容，不作为业务维护入口。

## 2026-05-15 重点问题附件缩略图返修

- 重点问题新增/编辑表单不再渲染 `problemPhotoBucketName` / `problemPhotoObjectKey` 对应的图片 Bucket、图片 Key 输入；前端类型与 API adapter 仍兼容旧字段，用于读取历史数据和保存时内部透传，不作为用户维护入口。
- 通用 `AttachmentList` 对可预览图片附件直接通过 `/attachments/{id}/preview/` 受控 Blob 通道加载缩略图网格；用户点击缩略图后复用同一受控预览 lightbox 放大，不读取或展示 bucket、object key、downloadUrl。
- 重点问题描述、整改对策、当前进展和备注字段下方按 `key_issue_slot` metadata 展示附件区域；图片显示缩略图，非图片仍以文件行展示，下载按钮继续受 `canWrite/canDownload` 与后端 `can_download` 共同约束。
- 导出任务列表不再把产物 bucket/object key 作为文件名或二级说明渲染；产物下载仍通过受控下载链接获取。

## 2026-05-15 附件删除与单图说明

- `AttachmentList` 支持管理员删除附件和维护单张图片说明；说明写入附件自身 `metadata.caption`，不再用栏位级 `imageCaptions` 作为新图片的主维护入口。
- 重点问题和碰撞一页纸字段贴图区域展示每张图片自己的说明输入与保存按钮，多图场景每张图可独立说明；只读态仅展示已有说明。
- 删除和说明保存分别调用后端 `/attachments/{id}/` 与 `/attachments/{id}/metadata/`，完成后刷新当前项目数据，保持缩略图、审计和导出读取同一份附件 metadata。

## 2026-05-15 Dashboard 项目级审计

- Dashboard 首页项目卡本身作为项目审计入口：点击卡片加载该项目 `/projects/{id}/audit-logs/`，卡片内模块按钮继续负责跳转阶段、检查项、重点问题、碰撞一页纸和配置中心。
- `AuditHistoryPanel` 从对象级历史面板扩展为可配置标题、说明、项目列和对象列的通用审计展示组件；检查项/重点问题/碰撞一页纸沿用对象级模式，项目卡使用对象列展示项目内所有业务对象。
- `fetchProjectAuditLogs()` 会按后端分页拉取项目审计日志，默认每页 200 条并自动翻页，避免 Dashboard 只显示第一页。

## 2026-05-19 附件共享盘配置

- Auto Status 不直接读取 `SHARED_STORAGE_SMB_URL / SMB_URL / PLC_SHARE_SMB_URL` 环境变量作为业务配置入口；SPA 配置中心通过共享存储配置 API 维护 `li_bs_auto_status` scope。
- “附件共享盘”是 Auto Status 全局配置模块，侧边栏独立入口维护唯一 `li_bs_auto_status` profile；它对所有项目实例生效，不随项目筛选、工厂、车间或产线变化。
- 配置中心只负责项目实例、阶段、检查项和模块负责人，不再承载共享盘配置，避免用户误认为附件存储挂在单个项目下。
- 密码字段写入时前端只提交非空值，留空保留后端原密码；读取接口只返回 `passwordSet`，不回传真实密码。
- PLC 的共享盘配置仍由 `li_sicar_plc` 工厂/车间模型维护，Auto Status 仅消费通用共享存储 profile。

## 2026-05-15 碰撞一页纸字段级贴图

- 碰撞一页纸输入画布不再依赖单独“插入图片”按钮；各摘要栏位和正文栏位在自身输入框与画布容器监听剪贴板图片，兼容 `clipboardData.files`、`items` 和 HTML/data URL 图片。
- 字段级贴图上传仍复用 `/attachments/upload/`，对象绑定 `object_type=collision_report`、`object_id=<report.id>`，并在附件 `metadata` 中写入 `collision_slot`、`collision_slot_label`、`caption`、`source=clipboard_paste`。
- 图片说明以 `content.imageCaptions` 作为报告级字段保存，附件 metadata 中的 caption 作为上传时快照；展示时按 `collision_slot` 把附件归到对应栏位。
- 新建报告填写标题后可在粘贴图片时自动创建报告并绑定附件，避免产生无业务对象的游离附件。

## 2026-05-15 重点问题字段级贴图

- 重点问题编辑区支持在描述、对策、进展和备注输入框内直接粘贴图片；表单容器也会把粘贴图片落到最近聚焦栏位。
- 重点问题贴图上传复用 `/attachments/upload/`，对象绑定 `object_type=key_issue`、`object_id=<issue.id>`，附件 metadata 写入 `key_issue_slot`、`key_issue_slot_label`、`caption`、`source=clipboard_paste`。
- 重点问题详情依赖后端返回的 `attachments` 安全列表展示图片预览；图片说明以 `metadata.imageCaptions` 作为问题级字段保存，附件 metadata caption 作为上传快照。

## 2026-05-13 Dashboard 收口

- 默认入口为 `dashboard`，首屏承载项目选择、总完成率、导出入口、层级筛选、阶段轨道、检查模块泳道、检查项详情、重点问题表、碰撞一页纸、签核状态和附件入口。
- 数据接入优先走 `/api/li-bs-auto-status/v1/dashboard/` 聚合接口，项目列表与 dashboard 查询统一透传 `project`、`factory`、`workshop`、`production_line`、`status` 筛选参数。
- 项目创建遵循后端最终口径：`factory` / `workshop` 必选，`production_line` 可选；产线为空表示车间级项目。
- 基础数据级联读取 `/api/v1/base/factories/`、`/api/v1/base/workshops/`、`/api/v1/base/lines/`，后端不可用时用项目快照兜底，避免界面空白。
- dev 展示数据直接来自真实后端项目 API；后端默认配置只保留阶段模板、检查模块和检查项模板，不再创建原型样例项目。KeyIssue 重点问题表字段在后端已是正式列，前端类型直接兼容这些字段。
- 导出任务列表只展示状态、文件名、文件大小、内容类型和时间等安全元信息；下载统一通过管理员动作 `/api/li-bs-auto-status/v1/export-jobs/{id}/download-link/` 获取短链，禁止直接把 `content_url`、bucket/object key 或本地产物地址渲染为链接。
- 负责人候选接口保持 `/api/li-bs-auto-status/v1/idaas-candidates/`，前端 adapter 接受 snake_case 候选字段和候选数组包装；检查项责任人只允许从带 `idaasId/idaas_id` 的候选人中选择，不再提供手工责任人入口。

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

- 前端运行时完全依赖真实后端 API 数据，不再注册浏览器请求拦截器，也不保留本地填充数据文件。
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
- Dashboard 首页在总览和项目统计列表之间新增图表层：全量项目状态环形图、全量检查项闭环环形图、子项目完成率柱状图和子项目风险压力柱状图；图表只读取全量 dashboard/project stats，不参与页面筛选，项目筛选仍仅位于项目列表栏。
- Dashboard 顶层范围筛选从首页移除：顶部 sticky header 只承载 `li-bs-auto-status` 应用自身介绍、用户信息和明暗切换，不参与业务项目筛选，也不展示当前选中的业务项目状态；项目/范围筛选继续留在项目统计列表或配置中心对应栏位内。
- Dashboard 模块层级使用 `DashboardLayer` 轨道式分组：项目状态、阶段检查、风险与签核按纵向层级自然分隔，避免多个同权重 panel 连续堆叠导致层次不清。
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

## 2026-05-14 Dashboard 首页入口化

- Dashboard/Home 收口为项目汇总入口，只展示整体统计、精简图表和项目入口卡；不再在首页展开单项目统计、检查模块泳道、检查项详情、重点问题详情或碰撞一页纸正文。
- 首页项目卡优先消费 `/dashboard/projects/` 项目摘要中的 additive `phase_progress` / `stat.phaseProgress` 字段渲染圆点连线阶段轨，支持 5/6/N 阶段；字段暂缺时仅用 `currentPhaseName`、`phaseCount` 和项目完成率降级，不发起逐项目 detail/timeline N+1 请求。
- 首页项目卡阶段轨消费 `phase_progress.check_item_count` / `completed_check_item_count`，在总检查项摘要之外展示每个阶段的检查项完成简报；阶段排期统一按 ISO 周展示，精确日期保留在 tooltip，5/6 阶段在卡片内等分排布，不依赖横向拖动查看完整阶段。
- 阶段进度页 `timeline` 的时间甘特横轴按周刻度展示，阶段/检查项条仍按计划开始/结束日期计算位置，兼顾周视图扫描和日期级定位。
- 首页项目卡提供到阶段进度、检查项、重点问题、碰撞一页纸和配置中心的入口；点击时先设置全局当前项目，再切换目标模块。
- 阶段进度、检查项、重点问题、碰撞一页纸和报告导出模块顶部新增当前项目筛选条；用户在任一模块切换项目后，后续模块默认沿用该全局当前项目。

## 2026-05-14 检查项多责任人前端契约

- `CheckItem` 新增 `owners: CheckItemOwner[]`，继续保留 `ownerName` / `ownerIdaasId` 作为主责任人快照兼容字段。
- 检查项 API adapter 接收后端 `owners` 数组，缺省时从旧快照字段降级生成单责任人；创建和更新检查项时提交 `owners` 数组，并把数组第一位同步到 `owner_name` / `owner_idaas_id` 与 `metadata` 快照。
- `CheckItemOwner` 前端模型和 adapter 保留后端多责任人扩展字段：`role`、`sortOrder/sort_order`、`isPrimary/is_primary`、`metadata`；保存时按当前列表顺序重写 `sort_order`，避免增删责任人丢失后端字段；`manualName/manual_name` 运行期置空。
- 检查项台账页与配置中心检查项表保持横向表格形态，责任人单元格内用头像 chip 展示多人，并提供 IDaaS 搜索添加和移除；只读态沿用 `canWrite` 禁用所有写控件。
- 候选人添加默认写入 `role=owner`；责任人身份必须包含 `idaasId`；移除按钮使用 lucide `X` 图标。
- 检查项台账、配置中心检查项和时间甘特的负责人筛选/关键字搜索均命中所有 `owners` 的姓名、IDaaS ID、邮箱和部门，而不是只看旧单一 `ownerName`。

## 2026-05-14 后端数据口径

- `li-bs-auto-status` 前端不再以 `BS-AUTO-PROTOTYPE` 或原型 seed 项目作为展示基线；页面展示、筛选和回归均直接读取后端正式项目数据。
- 后端默认数据只作为可复用配置存在：5/6 阶段模板、默认检查模块和检查项模板；项目样例需要通过后端项目 API 创建或导入。

## 2026-05-14 检查项状态更新链路

- 阶段进度页 `timeline` 在甘特图下方增加“阶段检查项状态更新”表格，按当前甘特筛选结果分阶段维护检查项状态，继续保留周刻度甘特用于排期扫描。
- 检查项台账页在状态列内新增同源状态更新控件，和阶段进度页共用 `CheckItemStatusControl`，避免两处状态操作口径分叉。
- 前端状态更新统一调用 `POST /check-items/{id}/set-status/`，提交 `status/source/comment`，由后端从 IDaaS 请求上下文写审计操作者。
- 后端 `PATCH /check-items/{id}/` 若状态发生变化，也补写 `check_item.status_change` 审计，确保配置中心保存状态和执行页快捷改状态都可追溯。
- 阶段甘特中的检查项条改为可点击按钮；点击后在甘特下方打开所选检查项面板，可直接更新状态并查看 `AuditHistoryPanel` 审计历史。
- `AuditHistoryPanel` 通过 `/audit-logs/?object_type=CheckItem&object_id=<id>` 拉取真实审计日志，展示时间、动作、状态变化、操作者、来源和 request id，不在前端伪造审计信息。
- 所选检查项面板新增附件区，上传走 `/attachments/upload/`，固定传 `object_type=check_item` 与当前检查项 `object_id`；下载走 `/attachments/{id}/download-link/` 获取受控预签名链接。
- 前端请求层对 `FormData` 跳过 JSON `Content-Type`，避免 multipart 上传被错误声明为 `application/json`。
- 阶段甘特所选检查项面板与检查项台账页共用 `OwnerListEditor` 和 `UserAvatar`；责任人新增通过 `/idaas-candidates/?q=...` 动态搜索，附件上传/下载在阶段进度和检查项页保持同一组件能力。

## 2026-05-14 重点问题与碰撞一页纸维护收口

- 重点问题与碰撞一页纸业务页从只读卡片改为“横向表格选行 + 下方自然维护表单”布局；筛选栏保留关键字、阶段、状态、风险、负责人和日期范围。
- 重点问题维护字段覆盖阶段、模块、检查项、标题、描述、严重度、状态、供应商、负责人、确认人、截止、整改对策、当前进展和备注；图片 bucket/key 用户可见输入已在 2026-05-15 返修移除，旧字段仅作为 API 兼容字段保留。
- 碰撞一页纸维护字段覆盖 phase、title、reportDate、status、riskLevel、summary、owner、dueDate 以及 content 常用正式字段，包括问题定义、零件、车型、故障频次、责任区域、问题描述、诊断维修、原因分析、措施、支持、影响、遏制、预防、验证和签核槽位。
- 前端 API adapter 新增重点问题和碰撞一页纸 create/update/delete/import/export 方法：CRUD 走现有项目子资源与顶层资源路由；CSV import/export 优先调用后端专用端点，后端未提供时降级为前端 CSV 解析后逐条调用正式 CRUD 或从正式列表生成 CSV。
- 权限口径不变：只读用户保留页面、筛选和列表查看能力，新增、编辑、删除、导入和导出 CSV 控件均按 `canWrite` 禁用。

## 2026-05-14 审计历史与一页纸 Excel

- `AuditHistoryPanel` 从检查项专用扩展为对象通用面板；重点问题和碰撞一页纸编辑区均通过真实 `/audit-logs/?object_type=<type>&object_id=<id>` 展示历史动作、操作者、来源和 request id。
- 重点问题审计查询固定使用 `object_type=KeyIssue`，碰撞一页纸审计查询固定使用 `object_type=CollisionReport`；前端只展示后端审计结果，不提交或伪造操作者。
- 碰撞一页纸编辑区新增单份 `导出 Excel` 操作，调用 `/collision-reports/{id}/export-excel/` 下载后端生成的 `xlsx` Blob；集合 CSV 导出仍保留项目级批量导出。
- 碰撞一页纸模块头部新增 `下载模板` 操作，调用 `/collision-reports/template/` 下载同版式、带占位提示的一页纸 Excel 模板；该入口不依赖选中报告或项目。
- 前端请求层新增 Blob 下载通道，复用既有 IDaaS session、CSRF/错误处理口径，避免把二进制响应交给 JSON 解析。

## 2026-05-15 附件图片预览体验

- 附件列表统一使用受控预览链路：图片附件点击“预览”后调用 `GET /attachments/{id}/preview/` 拉取 Blob，并在前端 lightbox 中展示；不直接暴露对象存储地址。
- 附件预览层支持关闭按钮、遮罩关闭和 ESC 关闭；预览中的下载按钮继续复用 `/attachments/{id}/download-link/`，按 `canWrite` 与后端 `can_download` 状态禁用。
- `Attachment` 类型兼容 `preview_url`、`can_preview`、`can_download`、`is_image`，同时仍接收旧 `bucket/object_key` 但普通附件列表不渲染真实 object key。
- 检查项附件上传保持原链路 `/attachments/upload/`；重点问题和碰撞一页纸编辑区新增所选对象附件列表，可预览图片并按权限下载已有附件。
- 重点问题列表/详情不再向用户展示问题照片 bucket/object key；图片存储旧字段只作为 API 兼容字段保留，不再提供管理维护输入。

## 2026-05-15 碰撞一页纸 Excel 对齐输入画布

- 碰撞一页纸维护区从普通表单升级为贴近导出 Excel 的白底纸面画布：顶部标题、品牌区、编制/状态/提出日期、问题定义横向摘要表、左右双栏正文和“1/2/3/4/5”分区与导出版式一致。
- 输入字段补齐 `source`、`processAnalysis`、`rootCauseConclusion`、`imageObjectKey`，保持写入 `content/metadata`，不改变后端模型结构。
- 所选一页纸支持在画布“现场图片 / 附件”区域直接插入图片，上传对象固定为 `object_type=collision_report`、`object_id=<report.id>`；新增报告需先保存再插图。
- 图片预览、下载继续复用受控附件组件，普通页面不暴露 SMB/object key。

## 2026-05-16 碰撞一页纸粘贴草稿保护

- 碰撞一页纸字段级粘贴图片前，前端必须先把当前字段实时文本合并进 `CollisionDraft` 并保存报告草稿，再执行附件上传，避免附件上传触发的数据刷新覆盖未保存文字。
- 新建报告场景继续由粘贴动作自动创建草稿报告；已保存报告场景在同一链路中先调用正式 update API，再调用附件上传 API，审计来源仍由后端 IDaaS 上下文记录。
- 正文输入区按文本长度和换行估算 textarea 行数，预览态正文使用 `white-space: pre-wrap` 和 `break-words` 完整展示长文本，避免一页纸正文在网页上被截断。

## 2026-05-16 碰撞一页纸字段级通用附件

- 碰撞一页纸正文栏位的附件区不再只展示图片 block；前端按 `CollisionReportBlock.blockType=image/file` 同源展示，图片走缩略图和受控预览，Excel/PPT/PDF 等非图片文件走文件卡片、说明、下载和删除。
- 每个正文栏位提供多文件上传入口，上传 metadata 继续写入 `section_key`、`collision_slot`、`collision_slot_label`、`caption`、`sort_order`、`source=file_upload`，后端自动同步为 `CollisionReportBlockType.FILE` 或 `IMAGE`。
- 前端 API fallback 在后端未返回 blocks 时，会把历史附件按 content type 转为 image/file block，避免历史非图片附件不可见。
- 一页纸 Excel 导出对非图片附件按栏位输出 `【附件N】文件名：说明` 文本引用；图片仍按原逻辑嵌入工作表。

## 2026-05-16 碰撞一页纸图片预览下载

- 碰撞一页纸编辑区取消 `impact` / `preventiveAction` / `validation` 三个附加输入入口，保留后端字段兼容历史数据与旧导出逻辑。
- 编辑画布新增客户端 PNG 预览下载能力：前端用 `html-to-image` 将当前 `.collision-sheet` 渲染成图片，先展示预览弹窗，再由用户下载 PNG。
- 生成 PNG 时临时添加 `is-capturing-image` class，隐藏上传、下载、删除等操作控件，并把输入控件视觉降级成普通文本，避免图片中出现操作按钮。
- PNG 捕获对附件缩略图的 Blob URL 使用 `cacheBust=false`，捕获前等待字体和图片解码完成；画布尺寸取 `scrollWidth/scrollHeight`，按尺寸动态限制 `pixelRatio`，失败时自动降级到 1x 重试，避免 dev-test 长报告、多图片附件场景预览失败。

## 2026-05-17 重点问题附件去重与模块负责人

- 重点问题维护页附件展示收敛到字段级槽位：描述、对策、进展、备注各自展示对应 `key_issue_slot` 附件，取消编辑表单底部的全量附件列表，避免图片/附件重复出现。
- `InspectionModule` 前端模型补齐 `ownerName/ownerIdaasId/ownerEmail/owners/metadata`，API adapter 从后端模块负责人快照和 `metadata.owners` 归一化为 IDaaS 负责人数组。
- 模块负责人保存调用 `PATCH /inspection-modules/{id}/`，把第一负责人同步到 `owner_*` 快照，并把完整负责人数组写入 `metadata.owners`；负责人候选仍通过 IDaaS 搜索组件选择。
- 配置中心底部“检查模块”支持维护模块负责人，并提供“应用到检查项”批量动作；批量动作会先保存模块负责人，再更新当前项目下该模块的检查项 `owners`，并在检查项 metadata 中标记 `owner_source=module`。
- 检查项新增入口在选择模块时默认带出模块负责人；检查项级负责人仍可单独覆盖，保持模块级默认和检查项级例外并存。

## 2026-05-17 项目模板独立模块

- 侧边栏新增 `templates` / “项目模板”模块，作为创建项目模板和模板检查项维护的独立入口；配置中心不再展示检查项模板，避免模板源数据和项目实例配置混在一起。
- 项目模板页上半部分列出 `PhaseTemplate` 创建项目模板，显示模板版本、阶段数、清单模板数、模板检查项总数和启用状态；模板阶段定义来自后端 `phase_definitions`。
- 项目模板页下半部分按所选 `PhaseTemplate` 展示对应 `ChecklistTemplate` 清单模板，用户选择清单后用横向表格维护其 `item_templates`。
- 模板检查项编辑支持新增、删除、修改排序、标题、描述/验收口径、优先级、计划开始、计划结束和启用状态；保存调用 `PATCH /checklist-templates/{id}/`，只更新模板源数据，不自动覆盖已有项目实例检查项。
- `ChecklistTemplate` 前端模型补齐 `moduleCode/moduleName/phaseTemplateCode/phaseKey/version/isActive/itemTemplates/metadata`；`PhaseTemplate` 补齐 `version/description/phaseDefinitions/metadata`。

## 2026-05-17 项目模板矩阵 CRUD

- 项目模板页以“检查模块 × 项目阶段”矩阵作为模板覆盖主视图：行来自 `InspectionModule`，列来自所选 `PhaseTemplate.phaseDefinitions`，单元格映射 `ChecklistTemplate(module, phase_template, phase_key)`。
- `PhaseTemplate` 前端支持新建、编辑、删除和复制草稿；阶段定义可在模板属性区维护 key、名称、排序、计划窗口、持续天数和说明。
- `ChecklistTemplate` 前端支持矩阵单元格新增、编辑、删除和 `item_templates` 横向表格维护；保存时统一走正式 `/checklist-templates/` CRUD，不产生 mock 或本地填充数据。
- 复制模板由前端编排：先创建 `is_active=false` 的阶段模板草稿，再复制源模板下所有关联清单模板与模板检查项，并在阶段模板和清单模板 metadata 写入 `copied_from`。
- 删除阶段模板时前端先删除其关联清单模板，再删除阶段模板，避免后端 `SET_NULL` 造成孤儿清单模板。
- 配置中心创建项目新增项目模板选择，但只列出启用模板；草稿/停用模板必须先在项目模板模块启用后才能用于创建项目。

## 2026-05-17 检查模块维护矩阵联动

- 项目模板页新增 `InspectionModule` 维护区，位于模块 × 阶段矩阵前，采用“横向表格选行 + 下方编辑表单”的配置页交互。
- 模块维护字段覆盖 `code/name/description/sort_order/is_active` 和 IDaaS 负责人；负责人保存到模块 `owner_*` 快照，并把完整负责人数组写入 `metadata.owners`。
- 前端 API adapter 新增 `createInspectionModule()`、`updateInspectionModule()`、`deleteInspectionModule()`；旧的 `updateInspectionModuleOwner()` 收敛为调用 `updateInspectionModule()` 的负责人子集。
- 模板矩阵行、清单模板模块下拉和新建清单模板默认模块都读取最新 `data.inspectionModules`，模块保存后通过 `loadData()` 刷新全局基础数据。
- 模块删除不做前端级强删规避，直接调用后端 DELETE；后端 `InspectionModule` 被 `ChecklistTemplate` 或 `CheckItem` 引用时按 PROTECT 拒绝，前端展示错误提示。
