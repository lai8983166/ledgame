# 每份游戏包独立保存数据

正式游戏端将 `LED Game.exe` 所在目录下的 `data` 作为数据根目录。启动快捷方式的工作目录不影响该位置；两个不同目录的游戏包使用各自的数据与单实例锁。重复打开同一目录的包只唤回已有窗口。

```text
游戏包/
  LED Game.exe
  data/
    database/runtime/ledgame.mv.db
    database/backups/
    settings/application.json
    settings/language.json
    branding/
    logs/
    session/
  resources/
    seed-database/
    media/
  elc408/
```

`settings/application.json` 保存配置 Tab 的配置，游戏内容继续保存在 H2 数据库。图标、副屏背景和待机媒体选择后复制至 `data/branding`；配置持久化为相对资源路径，整包移动或复制后从副本自己的目录解析。普通游戏媒体仍位于本包的 `resources/media`，硬件配置仍位于本包的 `elc408`。

重新打包会将旧发行目录已保存的数据库、配置和配置资源带入新 ZIP。包内没有已有数据库时，首次启动才从本包 `resources/seed-database/runtime` 初始化；没有已有配置时使用默认值。程序不会自动读取旧的共享配置和数据库。旧数据根目录通常为 `%APPDATA%\led-game`，旧版显式设置过 `LED_USER_DATA_DIR` 时以该设置为准。

数据目录必须可写。请完整解压到用户有写权限的文件夹再运行；不能直接在 ZIP 中运行或放入禁止写入的目录。目录不可写时游戏端显示具体路径并退出，不会改用共享目录。

## 从旧版迁移

1. 关闭旧版与新版游戏端，确认相关 Java 游戏服务已经退出。请勿复制正在运行的 H2 数据库。
2. 备份完整旧数据根目录以及旧游戏包。
3. 在尚未运行的新游戏包中创建 `data`，将旧数据根目录中的 `database`、`settings`、`branding` 和 `activation` 四个文件夹完整复制进去；缺少的文件夹无需补建。保留原件。若新版已经生成自己的数据，应先单独备份并使用空的目标目录，不要混合覆盖两份数据库。
4. 需要保留旧游戏媒体和硬件设置时，将旧包的 `resources/media`、`elc408` 一并复制至新包对应位置。
5. 在同一台电脑启动新版，核对游戏、配置和三类配置资源。旧设置中的绝对资源路径会绑定至新 `data/branding` 中同名资源；必须连同该目录一起迁移。

正式授权文件保存于当前 Windows 用户固定的 `%APPDATA%\led-game\activation`，同机同用户的不同包共用有效机器授权。旧包 `data/activation` 及历史 Java 默认目录中的授权会先核验签名、产品和本机身份，再迁入固定目录；旧文件保留。移动或重新打包不会改变机器码，复制到不同机器仍不能使用原授权。Windows 用户切换、系统重装等情况按实际身份与授权文件可用性重新验证。

## 备份、复制与升级

关闭游戏及其后台服务后再备份或复制完整游戏包。复制出的包独立读写数据库和配置，后续改动不会同步到原包。升级前保留目标包的完整 `data`、`resources/media` 和 `elc408`，更新程序文件时不要删除这些目录。

执行 `pnpm portable:dist`（目录+ZIP）、`pnpm portable:zip` 或 `pnpm portable:dir` 会先为旧 `release/win-unpacked` 保存恢复快照，在新暂存目录打包和校验，再发布。默认继承旧包的 `data/database`（含备份）、`data/settings`、`data/branding`、`resources/media` 和 `elc408`。旧媒体或控制器目录即使为空也优先于开发目录，避免已删除文件重新出现。不存在旧目录才使用开发种子、媒体及默认控制器设置。

新 ZIP 包含上述已保存的持久数据，不含机器授权、运行日志和浏览器会话缓存；原目录中的这些本机文件保留。打包过程中旧包重新启动或原数据变化时拒绝发布。备份、暂存产物和结果记录留在 `.build/portable-rebuild-*`，失败时先查看该路径，不会让打包器清空原 `data`。不要直接调用 electron-builder 覆盖旧发行目录，因为直接调用仅做程序构建，不执行数据保留流程。

开发模式默认仍使用 Electron 开发配置目录。自动化或显式隔离启动可设置 `LED_USER_DATA_DIR`，它优先于默认根目录，同时隔离授权且不读取正式固定目录；普通发行启动无需设置此变量。请勿对需要相互独立的包设置同一个 `LED_USER_DATA_DIR`。

## 发行验收

执行 `pnpm portable:smoke-data` 验证现有 `release/win-unpacked`，或在命令后传入发行目录。脚本在 `.build/portable-data-smoke-*` 中创建副本，从其它工作目录启动两份真实 EXE，检查各自 H2 路径、端口、同包单实例和一致的本机授权状态。副本不带包内授权，按当前机器真实授权结果验证业务接口200或403。停机后通过随包 JRE/H2 写入独立验收标记，重启复核，并将含数据的副本复制到第三个目录验证配置、资源和数据库继续独立。它保留日志与结果文件，不改动发行目录或已有用户数据库。

配置及资源验证使用发行 ASAR 中的实际存储模块，并检查主进程接入。`portable:smoke-protection` 则显式隔离授权，持续验证未激活门禁及程序防护；两类验收都不添加免激活入口。测试关闭真实硬件连接，不代表可同时让多个副本控制同一套硬件。
