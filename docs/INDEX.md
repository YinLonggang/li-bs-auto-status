---
status: stable
owner: li-bs-auto-status
updated: 2026-10-01
---

# li-bs-auto-status 文档索引

[返回主仓文档索引](../../docs/INDEX.md)

本仓为 Auto Status 前端 SPA。当前采用轻量文档入口，后续新增设计、运维或 ADR 文档时按主仓文档治理规则归档。

## 组件参考

- [交互组件：检查项列表、图片/PDF 附件、右侧抽屉、模板矩阵与时间甘特](../src/components/README.md)

## 权限回归

[permission-regression.mjs](../permission-regression.mjs) 验证统一身份、项目/检查项归属、列表与详情、写入拒绝和管理员可逆保存/回读/审计。默认不写；缺少凭据、目标或模式均不能算通过。业务合同只维护在[后端 API](../../li_sicar/api/li-bs-auto-status/v1/README.md)。

- 离线回归：`npm run test:permission-regression`，使用合成 HTTP 替身，不访问运行中服务。
- 真实后端：设置 `PERM_PROJECT_ID`、`PERM_PROJECT_CODE`、`PERM_CHECK_ITEM_ID`、`PERM_FIXTURE_MARKER`，目标必须是本次已获准且独占的合成检查项，标题以标记加 `-` 开头。不会自动创建项目或夹具，也不删除业务对象。
- 实际写探针必须显式 `PERM_ALLOW_WRITES=1`。管理员仅临时 PATCH 描述并恢复原文；成功必须 200、详情一致、恢复确认且新增对应操作者审计。匿名/只读使用无效字段类型的 PATCH，必须得到权限 403而不是校验400；即使 ACL 回归也不应写入该无效值。403 后仍回读身份，不能当登出。
- `PERM_IDENTITY_SOURCE=current-dev` 仅接受 loopback，`PERM_TEST_MODE` 每次只能选 `writable`、`readonly` 或 `anonymous` 之一，不接收 Cookie。由[根仓进程级控制器](../../tools/dev/README.md#进程级自动验收)编排官方 Django 重启、API/浏览器验证及原身份恢复，环境文件零写入。输出证据层级为 `controlled-dev`，不是实际 IDaaS 登录验收；具体执行拒绝不能靠换入口解除。
- `PERM_IDENTITY_SOURCE=session` 保留正常登录会话方式；只读/管理员分别从本地 `PERM_RO_COOKIE`、`PERM_RW_COOKIE` 读取，不写入日志或 Git。可以 `PERM_TEST_MODE=all`；固定 Dev User 不得冒充 session 验收。
- `PERM_BASE_URL` 默认为 `http://127.0.0.1:8000`；不跟随重定向，HTML/JSON解析错误、超时、空响应和仅“非403”均失败。
- `PERM_OUTPUT` 指向忽略目录中的新 JSON 证据文件；已存在则在任何请求前拒绝。单态通过只输出 `SCENARIO_PASS`、`complete=false`；三份 controlled-dev 证据须核对相同目标、各态真实 PASS 和环境恢复后再汇总，不能用单态或 SKIP 充当完整验收。
- 匿名无法读取目标归属，故先执行获准的只读或管理员场景，再通过 `PERM_FIXTURE_EVIDENCE` 指向其成功 JSON；脚本验证其中项目 ID/code、检查项 ID、唯一标记及先前已验证的归属。session 的 all 模式自动先验证已登录场景。
- 超时后先读取实际值，不重发探针。遇并发正文变化不覆盖；恢复失败或效果未知明确输出恢复状态，需要保留现场处理，不重跑来掩盖失败。探针只恢复正文，不抹除新增审计或更新时间。不要让他人在探针期间同时编辑该合成对象。

### 浏览器验证

[permission-browser.mjs](../permission-browser.mjs) 使用后端已安装的 Playwright 和本机 Chromium/Chrome，逐态验证真实 Portal 与 SPA。入口为 `npm run permission-browser`，`--preflight` 仅启动并关闭本机浏览器，不访问业务服务。它沿用上述 fixture/模式参数，只支持 `current-dev`；`PERM_SPA_URL` 默认 `http://127.0.0.1:3005`，必须为本机 HTTP origin，可用 `PERM_BROWSER_EXECUTABLE` 选择已安装浏览器。

- 每种模式运行桌面 1440×1000、窄屏 390×844 的明暗四组合，使用全新隔离上下文，不复用用户浏览器资料或正常登录 Cookie；禁止 service worker。
- 核对 Portal/SPA 身份、登录状态、项目归属、列表新增权限、详情抽屉编辑/保存权限和横向布局。先等待 workspace 加载结束，不能把加载锁误判为权限拒绝。管理员只填入再恢复未保存草稿，不点击保存。
- 匿名态验证全屏登录提示、登录入口、重新检测后仍未登录、遮罩覆盖与实际命中测试、无编辑抽屉；不尝试点击遮罩后的业务导航，也不强制穿透登录屏障。
- 网络保护只允许 API 与 SPA 两个本机 origin，阻断所有附件请求及非预期写入。只读场景仅在显式获准时，经生产 service 对指定合成检查项发出无效字段类型的拒绝探针；必须 403 且保持登录。附件或非预期写入被阻断、页面错误、缺少变体或超时都判失败，不将“已拦截”当通过。
- `PERM_BROWSER_OUTPUT` 必须是忽略目录中的新 JSON 文件，已有文件在网络请求前拒绝。`controlled-dev-browser` 的 `PASS / complete=true` 只说明当前一态的四个 UI 组合通过，不替代 API 写入、另外两态或最终身份恢复。统一汇总由根控制器完成。

`npm run test:permission-regression` 同时覆盖 strict API 的合成 HTTP 回归和浏览器请求保护，不启动真实浏览器或 dev 服务。[后端隔离 HTTP 附件测试](../../li_sicar/li_bs_auto_status/tests/test_attachment_permissions_http.py) 则以临时数据库、缓存和真实临时文件测试原有授权链路，不等同于公司 dev、真实 IDaaS 登录或共享附件验收。各层实际执行结果与限制见[当日记录](../memory/2026-09-30.md)。

## 记忆目录

- [2026-10-01 配置中心抽屉与受控物理删除：实施与回归记录](../memory/2026-10-01.md)
- [2026-09-30 检查项与附件：dev 验收记录与 Git 交付边界](../memory/2026-09-30.md)
- [2026-09-29 甘特、列表抽屉、检查项与附件验收进展（历史）](../memory/2026-09-29.md)

- [架构记忆](../memory/architecture.md)
- [进度记忆](../memory/progress.md)
