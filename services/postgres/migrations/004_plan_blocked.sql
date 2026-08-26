-- 方案版本增加 blocked 状态。
--
-- 原来替代接收点不足两个时直接抛 409，整个事务回滚，连带把「这家医院下线了」
-- 这个事实一起抹掉：facility 状态、adapter_event、evidence_source 三处都不留痕。
-- 上游拿到 409 不会重试，事实就永久丢失了。
--
-- 推演算不出方案，不能反过来删除输入事实。正确做法是照常保存事实、照常失效
-- 旧批准，然后生成一个明确标记为「无可行方案」的方案版本。

ALTER TABLE cityos.plan_version
  DROP CONSTRAINT IF EXISTS plan_version_status_check;

ALTER TABLE cityos.plan_version
  ADD CONSTRAINT plan_version_status_check
  CHECK (status IN ('draft', 'approved', 'stale', 'blocked'));

ALTER TABLE cityos.plan_version
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
