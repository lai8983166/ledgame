# 游戏端授权防护

正式 Windows 包通过 Electron fuse、ASAR 完整性验证、后端 JAR 校验和受限启动配置，阻止常见的环境变量注入与文件替换式授权绕过。激活码格式、Ed25519 公钥和机器码算法保持兼容。

## 构建与启动

运行 `pnpm portable:dist` 生成目录和 ZIP 包。`beforePack` 对 `build-resources/backend/ledGame-backend.jar` 计算 SHA-256，并生成 `electron/backend-integrity.generated.cjs`。该文件进入 ASAR，但不进入 Git。直接调用 electron-builder 同样执行此步骤；缺少 JAR 或生成失败时构建失败。

正式程序在准备数据库、启动 Java 前验证实际 JAR。校验值缺失、读取失败或内容不匹配都会阻止服务启动，记录原因并提示重新安装完整程序。发布和升级必须同时替换 EXE、ASAR、后端 JAR 及配套运行时，不支持单独替换后端 JAR。

五个 fuse 禁用 RunAsNode、Node 环境选项和 Node 调试参数，启用仅从 ASAR 加载以及 ASAR 完整性验证。构建产物的校验需要同时确认 fuse、EXE 中的完整性资源、ASAR 和 JAR 相互匹配。

## 正式版配置边界

打包版忽略 `VITE_DEV_SERVER_URL`、`LED_BACKEND_URL`、`LED_RUNTIME_STATE_URL`，始终加载包内页面并启动经过校验的内嵌后端。未打包的开发环境仍支持这些联调入口。

Java 子进程只接收明确列出的系统和业务变量，以及启动器生成的端口、数据库、媒体与授权目录、会员平台地址。不会继承 JVM agent 选项、Spring JSON、外部配置位置或任意 `LED_*`、`ELC408_*` 变量。Windows 系统目录来自 Electron 已加载的 KERNEL32 模块，子进程使用固定系统 PATH，机器码读取使用系统目录中的绝对 `reg.exe` 路径。

内嵌后端命令行固定从 classpath 加载配置、使用 default profile、监听 `127.0.0.1`，并关闭 H2 控制台、API 文档、Swagger UI、Knife4j 及默认静态资源映射。应用目录和 `config/` 下的外部 Spring 配置不会覆盖这些设置。原先依赖 `SPRING_APPLICATION_JSON` 或 acceptance profile 注入的打包版模拟验收方式需改用开发环境或专用测试构建，正式发行包不保留这些入口。

游戏端向会员平台发起的 HTTP 和 WebSocket 出站连接保持原有方式。会员平台自身的监听配置不在本次修改范围内。

## 验证与边界

运行 `pnpm test` 验证前端与 Electron 逻辑；后端运行 `mvn test`。三个正式打包命令结束时自动运行 `pnpm portable:verify-protection` 检查校验链。运行 `pnpm portable:smoke-protection` 验证正常启动、机器码读取、未激活业务拒绝访问、环境注入无效，以及分别修改 JAR、ASAR 和使用解包目录替换时拒绝启动。smoke 在 `.build/` 下创建并保留一次性副本和日志，不修改发行包、已有授权或数据库；过程中会打开应用测试窗口。

这些措施提高常见绕过的成本。拥有机器控制权或安装目录写权限的人仍可能修改 EXE、外置 JRE 或内存中的执行逻辑。EXE 代码签名、安装目录权限和系统执行策略需要独立部署；本轮不引入新的证书或授权协议。
