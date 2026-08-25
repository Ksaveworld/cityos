# CityOS 本地 PostgreSQL

本目录只用于医疗资源异常 P0 的本地开发数据库。默认端口为 `55432`，数据库、用户和开发密码均由 `docker-compose.yml` 固定；生产环境不得复用这些凭据。

```powershell
npm run db:up
npm run db:migrate
npm run db:seed
$env:CITYOS_DATABASE_URL = 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'
npm run dev
```

迁移按文件名顺序执行，并在 `cityos.schema_migration` 中记录 SHA-256。已经应用的迁移文件不得修改；需要变更时新增下一序号文件。

`db:down` 只停止并移除 CityOS Compose 容器和网络，不删除命名卷。需要清除本地数据时必须另行确认目标卷后再操作。
